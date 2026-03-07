import urllib.request
import sys
import subprocess

try:
    import fitz
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "pymupdf"])
    import fitz

url = 'https://prsindia.org/files/bills_acts/bills_parliament/2023/Bharatiya_Nyaya_Second_Sanhita,_2023.pdf'
urllib.request.urlretrieve(url, 'bns.pdf')

doc = fitz.open('bns.pdf')
text = ''.join([page.get_text() for page in doc])

with open('bns.txt', 'w', encoding='utf-8') as f:
    f.write(text)

print("Extraction complete.")
