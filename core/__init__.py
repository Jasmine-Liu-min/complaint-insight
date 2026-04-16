import pandas as pd


def read_excel(file, sheet_name=0):
    df = pd.read_excel(file, sheet_name=sheet_name, engine="openpyxl")
    df.columns = df.columns.astype(str).str.strip()
    return df, df.columns.tolist()


def get_sheet_names(file):
    xls = pd.ExcelFile(file, engine="openpyxl")
    return xls.sheet_names


def map_columns(df, mapping):
    rename = {v: k for k, v in mapping.items() if v}
    df = df.rename(columns=rename)
    if "date" in df.columns:
        col = df["date"]
        # 尝试直接解析
        parsed = pd.to_datetime(col, errors="coerce")
        # 如果大量失败，尝试当作Excel数字序列号
        if parsed.notna().sum() < len(col) * 0.5:
            try:
                numeric = pd.to_numeric(col, errors="coerce")
                from_excel = pd.to_datetime("1899-12-30") + pd.to_timedelta(numeric, unit="D")
                # 用成功解析更多的那个
                if from_excel.notna().sum() > parsed.notna().sum():
                    parsed = from_excel
            except Exception:
                pass
        # 过滤掉明显不合理的日期（1970之前）
        parsed = parsed.where(parsed > "2000-01-01")
        df["date"] = parsed
    for col in ("content", "feedback"):
        if col in df.columns:
            df[col] = df[col].astype(str).replace("nan", "")
    # 过滤掉没有客诉内容的行
    if "content" in df.columns:
        df = df[df["content"].str.strip().ne("") & df["content"].ne("nan")].reset_index(drop=True)
    return df
