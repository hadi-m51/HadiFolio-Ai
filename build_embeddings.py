import os
import json
import numpy as np
from sentence_transformers import SentenceTransformer

def build_embeddings():
    extracted_laws_path = os.path.join(os.path.dirname(__file__), 'extracted_laws.json')
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
                articles.append(text)
        if 'المدد_النظامية' in law:
            for item in law['المدد_النظامية']:
                text = f"المادة: {item.get('المادة', '')}\nالمدة: {item.get('المدة', '')}\nالنص: {item.get('النص', '')}"
                articles.append(text)
        if 'تصنيفات_الدعاوى' in law:
            for item in law['تصنيفات_الدعاوى']:
                text = f"التصنيف العام: {item.get('التصنيف العام', '')}\nتصنيف الدعوى الرئيسي: {item.get('تصنيف الدعوى الرئيسي', '')}\nتصنيف الدعوى الفرعي: {item.get('تصنيف الدعوى الفرعي', '')}"
                articles.append(text)

    print(f"[*] Total articles/chunks to embed: {len(articles)}")
    
    print("[*] Loading model paraphrase-multilingual-MiniLM-L12-v2...")
    model = SentenceTransformer("sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")
    
    print("[*] Computing embeddings (this may take a minute)...")
    embeddings = model.encode(articles, show_progress_bar=True)
    
    output_path = os.path.join(os.path.dirname(__file__), 'api', 'embeddings.npy')
    np.save(output_path, embeddings)
    print(f"[OK] Saved embeddings to {output_path}")

if __name__ == "__main__":
    build_embeddings()
