#!/bin/bash
sed -i '' 's/ScheduleShootModal/ScheduleShootsModal/g' components/dashboard/shoot-actions.tsx
cat << 'REPLACE' > tmp_sed.py
import re
with open('components/dashboard/shoot-actions.tsx', 'r') as f:
    content = f.read()

modal_regex = r"<ScheduleShootsModal\s+open=\{open\}\s+onClose=\{\(\) => setOpen\(false\)\}\s+shoot=\{[^\}]+\}\s*\/>"
new_modal = "<ScheduleShootsModal open={open} onClose={() => setOpen(false)} initialClientId={shoot.client_id} />"
content = re.sub(modal_regex, new_modal, content, flags=re.DOTALL)

with open('components/dashboard/shoot-actions.tsx', 'w') as f:
    f.write(content)
REPLACE
python3 tmp_sed.py
