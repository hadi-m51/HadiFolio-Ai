"""
المرجع النظامي — Flask API Server
Connects Pinecone (vector search) + Gemini (AI analysis) for Saudi Legal Assistant.
All API keys are loaded from .env and NEVER exposed to frontend.
"""

import os
import sys
import io
import json
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
import requests
import numpy as np

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# ── Load Environment Variables ──
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if not GEMINI_API_KEY:
    raise RuntimeError("[ERROR] GEMINI_API_KEY not found in .env")

# ── Initialize Services ──
app = Flask(__name__, static_folder='..', static_url_path='')
CORS(app)

print("[*] Loading embedding model...")
embed_model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
print("[OK] Embedding model loaded")

# ── Load Local JSON and Embeddings ──
extracted_laws_path = os.path.join(os.path.dirname(__file__), '..', 'extracted_laws.json')
print(f"[*] Loading {extracted_laws_path}...")
with open(extracted_laws_path, 'r', encoding='utf-8') as f:
    laws_data = json.load(f)

articles = []
for law in laws_data:
    law_title = law.get('اسم_النظام', '')
    source = law.get('المصدر', '')
    if 'المواد' in law:
        for article in law['المواد']:
            text = f"المادة {article.get('رقم_المادة', '')}: {article.get('نص_المادة', '')}"
            articles.append({
                "law_title": law_title,
                "source": source,
                "text": text,
            })
    if 'المدد_النظامية' in law:
        for item in law['المدد_النظامية']:
            text = f"المادة: {item.get('المادة', '')}\nالمدة: {item.get('المدة', '')}\nالنص: {item.get('النص', '')}"
            articles.append({
                "law_title": "المدد النظامية",
                "source": "دليل المدد النظامية",
                "text": text,
            })
    if 'تصنيفات_الدعاوى' in law:
        for item in law['تصنيفات_الدعاوى']:
            text = f"التصنيف العام: {item.get('التصنيف العام', '')}\nتصنيف الدعوى الرئيسي: {item.get('تصنيف الدعوى الرئيسي', '')}\nتصنيف الدعوى الفرعي: {item.get('تصنيف الدعوى الفرعي', '')}"
            articles.append({
                "law_title": "تصنيفات الدعاوى في ناجز",
                "source": "دليل اختصاص الدعاوى وتصنيفاتها",
                "text": text,
            })

embeddings_path = os.path.join(os.path.dirname(__file__), 'embeddings.npy')

if os.path.exists(embeddings_path):
    print("[*] Loading pre-computed embeddings...")
    article_embeddings = np.load(embeddings_path)
    print("[OK] Embeddings loaded.")
else:
    print(f"[*] Computing embeddings for {len(articles)} articles (this may take a few minutes)...")
    texts_to_encode = [a['text'] for a in articles]
    article_embeddings = embed_model.encode(texts_to_encode)
    np.save(embeddings_path, article_embeddings)
    print("[OK] Embeddings computed and saved.")

GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={GEMINI_API_KEY}"

# ── Helper Functions ──

def search_local(query: str, top_k: int = 5, law_filter: str = None) -> list:
    """Search local articles using cosine similarity."""
    query_vec = embed_model.encode(query)
    
    # Cosine similarity calculation
    scores = np.dot(article_embeddings, query_vec) / (np.linalg.norm(article_embeddings, axis=1) * np.linalg.norm(query_vec) + 1e-9)
    
    top_indices = np.argsort(scores)[::-1]
    
    matches = []
    for idx in top_indices:
        if law_filter and law_filter not in articles[idx]['law_title']:
            continue
        matches.append({
            "text": articles[idx]['text'],
            "source": articles[idx]['source'],
            "law_title": articles[idx]['law_title'],
            "score": round(float(scores[idx]), 4)
        })
        if len(matches) == top_k:
            break
    return matches


def call_gemini(prompt: str) -> str:
    """Call Gemini API for AI-powered analysis."""
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.3,
            "maxOutputTokens": 4096,
            "topP": 0.8,
        },
        "safetySettings": [
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
    }
    try:
        resp = requests.post(GEMINI_URL, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as e:
        print(f"[ERROR] Gemini API Error: {e}")
        return f"حدث خطأ أثناء الاتصال بالذكاء الاصطناعي: {str(e)}"


# ── Static File Serving ──

@app.route('/')
def serve_index():
    return send_from_directory('..', 'index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('..', path)


# ── API Routes ──

@app.route('/api/query', methods=['POST'])
def api_query():
    """Main consultation endpoint: search + Gemini analysis."""
    data = request.json
    question = data.get('question', '').strip()
    if not question:
        return jsonify({"error": "يرجى إدخال سؤال"}), 400

    matches = search_local(question, top_k=5)
    if not matches:
        return jsonify({
            "answer": "لم أجد مواد نظامية ذات صلة بسؤالك. يرجى إعادة صياغة السؤال.",
            "sources": []
        })

    context = "\n\n".join([
        f"[من: {m['law_title']}]\n{m['text']}" for m in matches
    ])

    prompt = f"""أنت مساعد أكاديمي قانوني متخصص في الأنظمة السعودية.
أجب على السؤال التالي بالاستناد فقط إلى المواد النظامية المقدمة أدناه.
يجب أن تكون إجابتك:
1. دقيقة ومستندة إلى النصوص المقدمة
2. تذكر رقم المادة والنظام المصدر عند الاستشهاد
3. باللغة العربية الفصحى
4. منظمة وواضحة

السؤال: {question}

المواد النظامية ذات الصلة:
{context}

أجب بشكل أكاديمي منظم مع الاستشهاد بالمواد:"""

    answer = call_gemini(prompt)
    sources = [{"source": m["source"], "law_title": m["law_title"], "score": m["score"]} for m in matches]

    return jsonify({"answer": answer, "sources": sources})


@app.route('/api/court', methods=['POST'])
def api_court():
    """Determine the competent court based on case description."""
    data = request.json
    description = data.get('description', '').strip()
    if not description:
        return jsonify({"error": "يرجى وصف القضية"}), 400

    matches = search_local(f"اختصاص محكمة دعوى {description}", top_k=5)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    prompt = f"""أنت مستشار قانوني متخصص في تحديد الاختصاص القضائي في المملكة العربية السعودية.
بناءً على المواد النظامية التالية، حدد:
1. المحكمة المختصة (عامة / جزائية / تجارية / عمالية / أحوال شخصية)
2. الدائرة المختصة إن أمكن
3. السند النظامي (المادة والنظام)
4. أي ملاحظات مهمة

وصف القضية: {description}

المواد النظامية:
{context}

أجب بشكل منظم:"""

    answer = call_gemini(prompt)
    return jsonify({"answer": answer, "sources": [m["law_title"] for m in matches]})


@app.route('/api/deadlines', methods=['POST'])
def api_deadlines():
    """Search for legal deadlines/periods."""
    data = request.json
    procedure = data.get('procedure', '').strip()
    if not procedure:
        return jsonify({"error": "يرجى تحديد الإجراء"}), 400

    matches = search_local(f"مدة مهلة ميعاد {procedure}", top_k=6)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    prompt = f"""أنت متخصص في المدد والمواعيد النظامية في الأنظمة السعودية.
بناءً على المواد التالية، اذكر:
1. المدة النظامية المطبقة
2. بدء احتساب المدة
3. آثار انقضاء المدة
4. الاستثناءات إن وجدت
5. السند النظامي (المادة والنظام)

الإجراء المطلوب: {procedure}

المواد النظامية:
{context}

أجب بشكل منظم وواضح:"""

    answer = call_gemini(prompt)
    return jsonify({"answer": answer, "sources": [m["law_title"] for m in matches]})


@app.route('/api/browse', methods=['POST'])
def api_browse():
    """Browse a specific law's content."""
    data = request.json
    law_name = data.get('law', '').strip()
    search_term = data.get('search', '').strip()
    page = int(data.get('page', 1))
    per_page = 10

    if search_term:
        query = f"{search_term} في {law_name}" if law_name else search_term
        matches = search_local(query, top_k=10, law_filter=law_name if law_name else None)
        return jsonify({"results": matches, "has_more": False})
    else:
        if law_name:
            law_articles = [a for a in articles if law_name in a['law_title']]
        else:
            law_articles = articles
            
        start = (page - 1) * per_page
        end = start + per_page
        paginated = law_articles[start:end]
        
        results = []
        for a in paginated:
            results.append({
                "text": a["text"],
                "source": a["source"],
                "law_title": a["law_title"],
                "score": 1.0
            })
            
        has_more = end < len(law_articles)
        return jsonify({"results": results, "has_more": has_more})

@app.route('/api/laws', methods=['GET'])
def api_laws():
    """Return all unique law titles available in the extracted data."""
    unique_laws = []
    seen = set()
    for a in articles:
        title = a.get('law_title')
        if title and title not in seen:
            seen.add(title)
            unique_laws.append(title)
    
    return jsonify({"laws": unique_laws})

@app.route('/api/custom_data', methods=['GET'])
def api_custom_data():
    """Return raw JSON data for deadlines and classifications to allow advanced frontend filtering."""
    try:
        data = json.load(open(extracted_laws_path, 'r', encoding='utf-8'))
        deadlines = []
        classifications = []
        for d in data:
            if 'المدد_النظامية' in d:
                deadlines = d['المدد_النظامية']
            if 'تصنيفات_الدعاوى' in d:
                classifications = d['تصنيفات_الدعاوى']
        return jsonify({"deadlines": deadlines, "classifications": classifications})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/classify', methods=['POST'])
def api_classify():
    """Classify a case type based on facts."""
    data = request.json
    facts = data.get('facts', '').strip()
    if not facts:
        return jsonify({"error": "يرجى وصف الوقائع"}), 400

    matches = search_local(f"تصنيف دعوى نوع قضية {facts}", top_k=5)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    prompt = f"""أنت متخصص في تصنيف الدعاوى القضائية في المملكة العربية السعودية.
بناءً على الوقائع والمواد النظامية التالية، حدد:
1. تصنيف الدعوى (مدنية / جزائية / تجارية / عمالية / أحوال شخصية / إدارية)
2. التصنيف الفرعي في ناجز إن أمكن
3. النظام واجب التطبيق
4. المحكمة المختصة
5. الإجراءات الأولية المطلوبة

الوقائع: {facts}

المواد النظامية:
{context}

أجب بشكل منظم:"""

    answer = call_gemini(prompt)
    return jsonify({"answer": answer, "sources": [m["law_title"] for m in matches]})


@app.route('/api/compare', methods=['POST'])
def api_compare():
    """Compare articles between two laws."""
    data = request.json
    topic = data.get('topic', '').strip()
    law1 = data.get('law1', '').strip()
    law2 = data.get('law2', '').strip()
    if not topic:
        return jsonify({"error": "يرجى تحديد موضوع المقارنة"}), 400

    matches1 = search_pinecone(f"{topic} {law1}", top_k=4)
    matches2 = search_pinecone(f"{topic} {law2}", top_k=4)

    context1 = "\n".join([f"[{m['law_title']}] {m['text']}" for m in matches1])
    context2 = "\n".join([f"[{m['law_title']}] {m['text']}" for m in matches2])

    prompt = f"""أنت محلل قانوني متخصص في مقارنة الأنظمة السعودية.
قارن بين المواد التالية حول الموضوع المحدد:
1. اذكر أوجه التشابه
2. اذكر أوجه الاختلاف
3. الأثر العملي لكل فرق
4. التوصية الأكاديمية

موضوع المقارنة: {topic}

مواد النظام الأول:
{context1}

مواد النظام الثاني:
{context2}

أجب بشكل منظم في جدول مقارنة:"""

    answer = call_gemini(prompt)
    return jsonify({
        "answer": answer,
        "sources_law1": [m["law_title"] for m in matches1],
        "sources_law2": [m["law_title"] for m in matches2]
    })


@app.route('/api/memo', methods=['POST'])
def api_memo():
    """Generate a legal memo/brief structure."""
    data = request.json
    memo_type = data.get('type', '').strip()
    facts = data.get('facts', '').strip()
    if not facts:
        return jsonify({"error": "يرجى إدخال الوقائع"}), 400

    matches = search_local(f"{memo_type} {facts}", top_k=6)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    memo_types = {
        "claim": "صحيفة دعوى",
        "defense": "مذكرة جوابية (دفاع)",
        "appeal": "لائحة اعتراض (استئناف)",
        "reply": "مذكرة رد"
    }
    type_name = memo_types.get(memo_type, memo_type)

    prompt = f"""أنت محامٍ متخصص في إعداد المذكرات القانونية في المملكة العربية السعودية.
أنشئ هيكل {type_name} احترافي يتضمن:
1. البسملة والديباجة
2. بيانات الأطراف
3. موضوع الدعوى / المذكرة
4. الوقائع (منظمة ومرقمة)
5. الأسانيد النظامية (مع ذكر المواد)
6. الطلبات

الوقائع المقدمة: {facts}

المواد النظامية ذات الصلة:
{context}

أنشئ المذكرة بتنسيق احترافي مع الاستشهاد بالمواد النظامية:"""

    answer = call_gemini(prompt)
    return jsonify({"answer": answer, "sources": [m["law_title"] for m in matches]})


@app.route('/api/quiz', methods=['POST'])
def api_quiz():
    """Generate quiz questions about a specific law."""
    data = request.json
    law_name = data.get('law', '').strip()
    difficulty = data.get('difficulty', 'medium')
    num_questions = min(int(data.get('count', 5)), 10)

    query = law_name if law_name else "الأنظمة السعودية"
    matches = search_local(query, top_k=8)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    diff_map = {"easy": "سهلة", "medium": "متوسطة", "hard": "صعبة"}
    diff_label = diff_map.get(difficulty, "متوسطة")

    prompt = f"""أنت معد اختبارات أكاديمية في القانون السعودي.
أنشئ {num_questions} أسئلة اختيارية ({diff_label} الصعوبة) بناءً على المواد التالية.

لكل سؤال:
- نص السؤال
- 4 خيارات (أ، ب، ج، د)
- الإجابة الصحيحة (حرف فقط)
- شرح مختصر مع ذكر المادة المرجعية

المواد:
{context}

أجب بصيغة JSON كالتالي:
{{
  "questions": [
    {{
      "question": "نص السؤال",
      "options": ["أ. ...", "ب. ...", "ج. ...", "د. ..."],
      "correct": 0,
      "explanation": "الشرح مع المادة المرجعية"
    }}
  ]
}}

أجب فقط بـ JSON بدون أي نص إضافي:"""

    answer = call_gemini(prompt)

    # Try to parse JSON from Gemini response
    try:
        # Clean potential markdown formatting
        clean = answer.strip()
        if clean.startswith("```"):
            clean = clean.split("\n", 1)[1] if "\n" in clean else clean[3:]
            if clean.endswith("```"):
                clean = clean[:-3]
            clean = clean.strip()
            if clean.startswith("json"):
                clean = clean[4:].strip()
        quiz_data = json.loads(clean)
    except json.JSONDecodeError:
        quiz_data = {"questions": [], "raw": answer}

    return jsonify(quiz_data)


@app.route('/api/glossary', methods=['POST'])
def api_glossary():
    """Explain a legal term with references."""
    data = request.json
    term = data.get('term', '').strip()
    if not term:
        return jsonify({"error": "يرجى إدخال المصطلح"}), 400

    matches = search_local(f"تعريف معنى {term}", top_k=5)
    context = "\n\n".join([f"[{m['law_title']}]\n{m['text']}" for m in matches])

    prompt = f"""أنت أستاذ قانون متخصص في شرح المصطلحات القانونية السعودية.
اشرح المصطلح التالي بشكل أكاديمي شامل:

1. التعريف اللغوي والاصطلاحي
2. التعريف النظامي (إن ورد في الأنظمة)
3. أمثلة عملية
4. المواد النظامية ذات الصلة
5. مصطلحات مرتبطة

المصطلح: {term}

المواد النظامية:
{context}

أجب بشكل أكاديمي منظم:"""

    answer = call_gemini(prompt)
    return jsonify({"answer": answer, "sources": [m["law_title"] for m in matches]})


# ── Health Check ──
@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({
        "status": "ok",
        "vectors": len(articles),
        "index": "local_extracted_laws"
    })


# ── Run Server ──
if __name__ == '__main__':
    print("\n[START] Legal Assistant API Server (Local Search Mode)")
    print("=" * 50)
    print(f"URL: http://localhost:5000")
    print(f"Loaded {len(articles)} articles locally.")
    print("=" * 50)
    app.run(host='0.0.0.0', port=5000, debug=True)
