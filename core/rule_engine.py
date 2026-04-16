import json
import os
import jieba

_RULES_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "rules.json")


def load_rules(path=None):
    p = path or _RULES_PATH
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_rules(rules, path=None):
    p = path or _RULES_PATH
    with open(p, "w", encoding="utf-8") as f:
        json.dump(rules, f, ensure_ascii=False, indent=2)


def match(text, category, rules):
    """对单条文本做细粒度归因。
    同时用精确匹配和分词匹配，提高召回率。
    """
    text_str = str(text)
    text_lower = text_str.lower()
    # jieba分词结果用于模糊匹配
    words_set = set(jieba.lcut(text_lower))

    sub_rules = rules.get(category, [])
    if not sub_rules:
        # 没有对应粗分类的规则，尝试全局匹配
        sub_rules = []
        for cat_rules in rules.values():
            sub_rules.extend(cat_rules)

    best, best_score = "其他/待归因", 0
    for rule in sub_rules:
        score = 0
        for kw in rule["keywords"]:
            kw_lower = kw.lower()
            if kw_lower in text_lower:
                # 精确匹配，权重高
                score += 2
            elif kw_lower in words_set:
                # 分词匹配，权重低一些
                score += 1
        if score > best_score:
            best, best_score = rule["sub_category"], score

    return best


def apply_rules(df, rules):
    has_category = "category" in df.columns
    has_feedback = "feedback" in df.columns

    def _match_row(row):
        text = str(row.get("content", ""))
        if has_feedback:
            text += " " + str(row.get("feedback", ""))
        cat = str(row["category"]) if has_category else ""
        return match(text, cat, rules)

    df["sub_category"] = df.apply(_match_row, axis=1)
    return df
