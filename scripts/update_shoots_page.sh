#!/bin/bash
sed -i '' 's/ScheduleShootModal/ScheduleShootsModal/g' app/admin/shoots/page.tsx
sed -i '' 's/bulk-schedule-modal/schedule-shoot-modal/g' app/admin/shoots/page.tsx
sed -i '' 's/BulkScheduleModal/ScheduleShootsModal/g' app/admin/shoots/page.tsx
