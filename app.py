import io
import json
from flask import Flask, render_template, request, jsonify, send_file
import pandas as pd

from core import read_excel, map_columns, get_sheet_names
from core.text_processor import get_top_words, extract_tfidf_keywords
from core.rule_engine import load_rules, save_rules, apply_rules

app = Flask(__name__)

# 内存中缓存当前数据
_state = {"raw_df": None, "df": None, "columns": [], "mapping": {}}


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/upload", methods=["POST"])
def upload():
    f = request.files.get("file")
    if not f:
        return jsonify(error="No file"), 400
    import io
    _state["file_bytes"] = io.BytesIO(f.read())
    sheets = get_sheet_names(_state["file_bytes"])
    _state["file_bytes"].seek(0)
    if len(sheets) == 1:
        df, cols = read_excel(_state["file_bytes"], sheet_name=0)
        _state["file_bytes"].seek(0)
        _state["raw_df"] = df
        _state["columns"] = cols
        return jsonify(sheets=sheets, columns=cols, rows=len(df), auto_selected=sheets[0])
    return jsonify(sheets=sheets)


@app.route("/api/select_sheet", methods=["POST"])
def select_sheet():
    sheet = request.json.get("sheet")
    if not sheet or _state.get("file_bytes") is None:
        return jsonify(error="No file or sheet"), 400
    _state["file_bytes"].seek(0)
    df, cols = read_excel(_state["file_bytes"], sheet_name=sheet)
    _state["raw_df"] = df
    _state["columns"] = cols
    return jsonify(columns=cols, rows=len(df))


@app.route("/api/analyze", methods=["POST"])
def analyze():
    if _state["raw_df"] is None:
        return jsonify(error="No data"), 400

    mapping = request.json
    _state["mapping"] = mapping
    df = map_columns(_state["raw_df"].copy(), mapping)

    has_category = "category" in df.columns
    has_model = "model" in df.columns
    has_feedback = "feedback" in df.columns

    # 归因
    rules = load_rules()
    has_sub = False
    if rules and has_category:
        df = apply_rules(df, rules)
        has_sub = True

    # 合并文本
    texts = df["content"].astype(str).tolist()
    if has_feedback:
        texts = [c + " " + str(f) for c, f in zip(texts, df["feedback"])]

    _state["df"] = df

    # 统计数据
    result = {"total": len(df), "has_category": has_category,
              "has_model": has_model, "has_sub": has_sub}

    # 分类分布
    if has_category:
        result["category_dist"] = df["category"].value_counts().to_dict()
    if has_sub:
        result["sub_dist"] = df["sub_category"].value_counts().to_dict()
        attr = df[df["sub_category"] != "其他/待归因"]
        result["attributed"] = len(attr)

    # 机型TOP10
    if has_model:
        result["model_top"] = (df["model"].astype(str).value_counts()
                               .head(10).to_dict())

    # 趋势（按周）
    if df["date"].notna().any():
        df_valid = df.dropna(subset=["date"])
        for freq_name, freq_code in [("daily", "D"), ("weekly", "W"), ("monthly", "ME")]:
            trend = (df_valid.set_index("date").resample(freq_code).size()
                     .reset_index(name="count"))
            result[f"trend_{freq_name}"] = {
                "dates": trend["date"].dt.strftime("%Y-%m-%d").tolist(),
                "counts": trend["count"].tolist(),
            }

    # 词频
    result["top_words"] = get_top_words(texts, n=50)

    # TF-IDF
    result["tfidf"] = extract_tfidf_keywords(texts, n=15)

    # 各分类关键词
    if has_category:
        cat_kw = {}
        for cat in df["category"].dropna().unique():
            cat_texts = df[df["category"] == cat]["content"].astype(str).tolist()
            kws = extract_tfidf_keywords(cat_texts, n=5)
            if kws:
                cat_kw[str(cat)] = [w for w, _ in kws]
        result["category_keywords"] = cat_kw

    # 明细数据
    detail_cols = ["date", "content"]
    if has_model:
        detail_cols.append("model")
    if has_category:
        detail_cols.append("category")
    if has_feedback:
        detail_cols.append("feedback")
    if has_sub:
        detail_cols.append("sub_category")

    detail = df[[c for c in detail_cols if c in df.columns]].copy()
    if "date" in detail.columns:
        detail["date"] = detail["date"].dt.strftime("%Y-%m-%d").fillna("")
    result["detail"] = detail.fillna("").to_dict(orient="records")

    return jsonify(result)


@app.route("/api/rules", methods=["GET"])
def get_rules():
    return jsonify(load_rules())


@app.route("/api/rules", methods=["POST"])
def update_rules():
    rules = request.json
    save_rules(rules)
    return jsonify(ok=True)


@app.route("/api/unattributed")
def unattributed():
    """分析待归因客诉的高频词，帮助发现遗漏的关键词"""
    if _state["df"] is None:
        return jsonify(error="No data"), 400
    df = _state["df"]
    if "sub_category" not in df.columns:
        return jsonify(error="No sub_category"), 400
    un = df[df["sub_category"] == "其他/待归因"]
    if un.empty:
        return jsonify(count=0, top_words=[], samples=[])
    texts = un["content"].astype(str).tolist()
    if "feedback" in un.columns:
        texts = [c + " " + str(f) for c, f in zip(texts, un["feedback"])]
    top = get_top_words(texts, n=30)
    tfidf = extract_tfidf_keywords(texts, n=15)
    samples = un["content"].astype(str).head(20).tolist()
    return jsonify(count=len(un), top_words=top, tfidf=tfidf, samples=samples)


@app.route("/api/export")
def export():
    if _state["df"] is None:
        return "No data", 400
    buf = io.BytesIO()
    df = _state["df"].copy()
    cols = [c for c in ["date", "content", "model", "category", "feedback", "sub_category"]
            if c in df.columns]
    rename = {"date": "时间", "content": "客诉内容", "model": "机型",
              "category": "分类", "feedback": "客服反馈", "sub_category": "细分归因"}
    df[cols].rename(columns=rename).to_excel(buf, index=False, engine="openpyxl")
    buf.seek(0)
    return send_file(buf, download_name="客诉分析结果.xlsx", as_attachment=True)


if __name__ == "__main__":
    app.run(debug=False, port=5000)
