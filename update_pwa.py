import os
import json

base_dir = r"d:\OneDrive - Saudi Electronic University\MyWeb_prog\myprog\hadifoliolaws"

# 1. Create manifest.json
manifest = {
  "name": "HadiFolio-Ai",
  "short_name": "HadiFolio-Ai",
  "start_url": "index.html",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "icons": [
    {
      "src": "images/apple-touch-icon.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "images/apple-touch-icon.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
with open(os.path.join(base_dir, "manifest.json"), "w", encoding="utf-8") as f:
    json.dump(manifest, f, indent=2)

# 2. Update all HTML files
tags_to_insert = """
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="HadiFolio-Ai">
  <link rel="apple-touch-icon" href="images/apple-touch-icon.png">
  <link rel="manifest" href="manifest.json">
  <meta name="theme-color" content="#0f172a">
"""

for fname in os.listdir(base_dir):
    if fname.endswith(".html"):
        path = os.path.join(base_dir, fname)
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
            
        content = content.replace('<link rel="apple-touch-icon" href="images/logo.svg">', '')
        
        if "apple-mobile-web-app-capable" not in content:
            content = content.replace("</head>", tags_to_insert + "</head>")
            with open(path, "w", encoding="utf-8") as f:
                f.write(content)
        print(f"Updated {fname}")
