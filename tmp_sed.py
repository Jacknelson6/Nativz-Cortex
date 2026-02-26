import re
with open('components/dashboard/shoot-actions.tsx', 'r') as f:
    content = f.read()

modal_regex = r"<ScheduleShootsModal[^>]+>"
new_modal = "<ScheduleShootsModal open={open} onClose={() => setOpen(false)} initialClientId={shoot.client_id} />"
content = re.sub(modal_regex, new_modal, content, flags=re.DOTALL)

with open('components/dashboard/shoot-actions.tsx', 'w') as f:
    f.write(content)
