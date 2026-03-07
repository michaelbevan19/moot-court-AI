import re
import json

with open('bns_full.txt', 'r', encoding='utf-8') as f:
    text = f.read()

# Clean the text
lines = text.split('\n')
clean_lines = []
for line in lines:
    l = line.strip()
    if not l: continue
    if l.isdigit() and len(l) < 4: continue
    if l.startswith('THE GAZETTE OF INDIA'): continue
    if l.startswith('SEC.'): continue
    if l.startswith('PART II'): continue
    if l.startswith('HSEC'): continue
    if 'EXTRAORDINARY' in l: continue
    if '_' in l and len(l.replace('_','')) < 5: continue
    clean_lines.append(l)

clean_text = '\n'.join(clean_lines)

# Target Chapters: XIII, XIV, XV, XVI, XVII, XVIII, XIX
chapters = ['XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX']
chapter_data_list = []

# Find all chap indices
chap_indices = {}
for chap in chapters:
    # Attempt to match CHAPTER XIII or CHAPTERXIII
    pattern = re.compile(f'^CHAPTER\\s*{chap}\\s*$', re.MULTILINE)
    match = pattern.search(clean_text)
    if match:
        chap_indices[chap] = match.start()
    else:
        # try without anchors
        pattern2 = re.compile(f'CHAPTER\\s*{chap}', re.MULTILINE)
        match2 = pattern2.search(clean_text)
        if match2:
            chap_indices[chap] = match2.start()

found_chapters = ['XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX']
for idx, chap_num in enumerate(found_chapters):
    if chap_num not in chap_indices:
        print(f"Skipping {chap_num}, index not found.")
        continue
        
    start_idx = chap_indices[chap_num]
    
    if idx + 1 < len(found_chapters):
        next_chap = found_chapters[idx+1]
        end_idx = chap_indices.get(next_chap, len(clean_text))
    else:
        end_idx = chap_indices.get('XX', len(clean_text))

    chap_content = clean_text[start_idx:end_idx].strip()
    
    # Process Chapter Content
    lines = chap_content.split('\n')
    chap_header = lines[0].strip()
    chap_title = lines[1].strip() if len(lines) > 1 else ""
    
    data = {
        'chapter': f'Chapter {chap_num}',
        'title': chap_title,
        'sections': []
    }
    
    # Find all sections like "^14. (1)..." or "^14. text..."
    sec_pattern = re.compile(r'^(\d+[A-Z]?)\.\s*(.*?)(?=\n^\d+[A-Z]?\.\s*|\Z)', re.MULTILINE | re.DOTALL)
    
    for sec_match in sec_pattern.finditer(chap_content):
        sec_num = sec_match.group(1)
        sec_body = sec_match.group(2).strip()
        
        # Determine title from body
        first_line = sec_body.split('.')[0]
        title = first_line if len(first_line) < 80 else "Section Details"
        
        data['sections'].append({
            'section': f'Section {sec_num}',
            'title': title.strip(),
            'content': f'{sec_num}. {sec_body}'
        })
        
    chapter_data_list.append(data)

# Write output
with open('bns_chapters_13_to_19.json', 'w', encoding='utf-8') as f:
    json.dump(chapter_data_list, f, indent=2, ensure_ascii=False)

print(f"Extracted {len(chapter_data_list)} chapters.")
for c in chapter_data_list:
    print(f"{c['chapter']}: {len(c['sections'])} sections")
