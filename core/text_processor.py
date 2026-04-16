import re
import os
from collections import Counter
import jieba
from sklearn.feature_extraction.text import TfidfVectorizer

_STOPWORDS = None
_STOPWORDS_PATH = os.path.join(os.path.dirname(__file__), "..", "config", "stopwords.txt")
_STOPWORDS_MTIME = 0


def _load_stopwords():
    global _STOPWORDS, _STOPWORDS_MTIME
    try:
        mtime = os.path.getmtime(_STOPWORDS_PATH)
    except FileNotFoundError:
        return set()
    if _STOPWORDS is None or mtime != _STOPWORDS_MTIME:
        with open(_STOPWORDS_PATH, "r", encoding="utf-8") as f:
            _STOPWORDS = set(line.strip() for line in f if line.strip())
        _STOPWORDS_MTIME = mtime
    return _STOPWORDS


def preprocess(text):
    if not isinstance(text, str):
        return ""
    return re.sub(r"[^\u4e00-\u9fa5a-zA-Z]", " ", text).strip()


def segment(text):
    stopwords = _load_stopwords()
    words = jieba.lcut(preprocess(text))
    return [w for w in words if len(w) > 1 and w not in stopwords]


def get_top_words(texts, n=20):
    counter = Counter()
    for t in texts:
        counter.update(segment(t))
    return counter.most_common(n)


def extract_tfidf_keywords(texts, n=10):
    seg_texts = [" ".join(segment(t)) for t in texts]
    seg_texts = [t for t in seg_texts if t.strip()]
    if not seg_texts:
        return []
    vec = TfidfVectorizer(max_features=1000)
    tfidf = vec.fit_transform(seg_texts)
    scores = tfidf.mean(axis=0).A1
    words = vec.get_feature_names_out()
    ranked = sorted(zip(words, scores), key=lambda x: x[1], reverse=True)
    return [(w, round(s, 4)) for w, s in ranked[:n]]
