import re

with open('app/admin/shoots/page.tsx', 'r') as f:
    content = f.read()

# 1. Remove duplicate import
content = re.sub(r"import \{ ScheduleShootsModal \} from '@\/components\/shoots\/schedule-shoot-modal';\nimport \{ IdeateShootModal \} from '@\/components\/shoots\/ideate-shoot-modal';\nimport \{ ScheduleShootsModal \} from '@\/components\/shoots\/schedule-shoot-modal';", 
                 r"import { ScheduleShootsModal } from '@/components/shoots/schedule-shoot-modal';\nimport { IdeateShootModal } from '@/components/shoots/ideate-shoot-modal';", 
                 content)

# 2. Remove bulkScheduleOpen state and use scheduleModalOpen for everything
content = re.sub(r"const \[bulkScheduleOpen, setBulkScheduleOpen\] = useState\(false\);\n", "", content)
content = re.sub(r"setBulkScheduleOpen", "setScheduleModalOpen", content)

# 3. Remove "Bulk emails" button
bulk_button_regex = r"<Button variant=\"ghost\" size=\"sm\" onClick=\{\(\) => setScheduleModalOpen\(true\)\} title=\"Bulk schedule emails\">\s*<Mail size=\{14\} \/>\s*Bulk emails\s*<\/Button>\s*"
content = re.sub(bulk_button_regex, "", content)

# 4. Update the "Schedule shoot" button to say "Schedule shoots" and use the Mail icon, removing the old setShootToSchedule(null)
schedule_button_regex = r"<GlassButton onClick=\{\(\) => \{ setShootToSchedule\(null\); setScheduleModalOpen\(true\); \}\}>\s*<Plus size=\{14\} \/>\s*Schedule shoot\s*<\/GlassButton>"
new_schedule_button = r"""<GlassButton onClick={() => { setShootToSchedule(null); setScheduleModalOpen(true); }}>
            <Mail size={14} />
            Schedule shoots
          </GlassButton>"""
content = re.sub(schedule_button_regex, new_schedule_button, content)

# 5. Remove hover + button from calendar
plus_button_regex = r"<\/?button[^>]*onClick=\{\(\) => \{\s*const dateStr[^}]*\}\}[^>]*>\s*<Plus size=\{12\} \/>\s*<\/button>"
content = re.sub(plus_button_regex, "", content)

# 6. Replace both modals at the bottom with a single ScheduleShootsModal
modals_regex = r"\{\/\* Schedule Shoot Modal \*\/\}.*?\{\/\* Ideate Shoot Modal \*\/\}"
new_modal = """{/* Schedule Shoots Modal */}
      <ScheduleShootsModal
        open={scheduleModalOpen}
        onClose={() => { setScheduleModalOpen(false); setShootToSchedule(null); }}
        initialClientId={shootToSchedule?.clientId || null}
      />

      {/* Ideate Shoot Modal */}"""
content = re.sub(modals_regex, new_modal, content, flags=re.DOTALL)

with open('app/admin/shoots/page.tsx', 'w') as f:
    f.write(content)
