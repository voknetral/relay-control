import re
import json
import os

input_file = '/tmp/kodewilayah_layout_full.txt'
output_file = '/home/hanifp/Documents/Anomali/assets/data/bmkg-codes.json'

print(f"Reading {input_file}...")
if not os.path.exists(input_file):
    print(f"Error: {input_file} not found. Run pdftotext -layout first.")
    exit(1)

kecamatan_codes = {} # id -> name
kelurahan_mappings = {} # kecamatan_id -> first_kelurahan_id

# Use search and then manual boundary check
kec_regex = re.compile(r'(\d{2}\.\d{2}\.\d{2})')
# name_regex: [Index] [Name]
name_regex = re.compile(r'(\d+)\s+([A-Z][A-Z\s\(\)\/\-\.]{3,})', re.I)

with open(input_file, 'r', errors='ignore') as f:
    lines = f.readlines()

print(f"Processing {len(lines)} lines...")
for i, line in enumerate(lines):
    # 1. Kelurahan First
    # A kelurahan code is 13 chars: XX.XX.XX.XXXX
    # If a line has a 4-part code, we use it for mapping adm4
    m_kels = re.findall(r'(\d{2}\.\d{2}\.\d{2}\.\d{4})', line)
    if m_kels:
        for kel_id in m_kels:
            kec_id = kel_id[:8]
            if kec_id not in kelurahan_mappings:
                kelurahan_mappings[kec_id] = kel_id
        # Skip kecamatan name matching on kelurahan rows
        continue

    # 2. Kecamatan in Summary section
    m_kecs = kec_regex.findall(line)
    if m_kecs:
        # Check if it's strictly 3 parts (look ahead in original string)
        for kec_id in m_kecs:
            # Check for trailing .digits
            idx_in_line = line.find(kec_id)
            if idx_in_line + 8 < len(line) and line[idx_in_line + 8] == '.':
                continue # It's part of a 4-part code
            
            last_part_int = int(kec_id.split('.')[-1])
            found = False
            for offset in range(0, 4):
                if i + offset < len(lines):
                    candidate = lines[i+offset]
                    # Search for the index and name
                    m_n = name_regex.search(candidate)
                    if m_n:
                        idx, name = m_n.groups()
                        if int(idx) == last_part_int:
                            name = name.strip().upper()
                            if name not in ["PROVINSI", "JUMLAH", "KABUPATEN"]:
                                kecamatan_codes[kec_id] = name
                                found = True
                                break
            if found: break

print(f"Found {len(kecamatan_codes)} Kecamatan and {len(kelurahan_mappings)} Kelurahan mappings.")

mappings = []
for kec_id in sorted(kecamatan_codes.keys()):
    name = kecamatan_codes[kec_id]
    adm4 = kelurahan_mappings.get(kec_id, f"{kec_id}.2001")
    mappings.append({
        "id": kec_id,
        "name": name,
        "adm4": adm4
    })

result = {
    "mappings": mappings,
    "default_adm4": "31.71.03.1001",
    "source": "Kepmendagri 100.1.1-6117 Tahun 2022"
}

with open(output_file, 'w') as f:
    json.dump(result, f, indent=2)

print(f"Successfully extracted {len(mappings)} mappings to {output_file}")
