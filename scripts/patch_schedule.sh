#!/bin/bash
sed -i '' 's/interface BulkScheduleModalProps/interface ScheduleShootsModalProps/' components/shoots/schedule-shoot-modal.tsx
sed -i '' 's/export function BulkScheduleModal({ open, onClose }: BulkScheduleModalProps)/export function ScheduleShootsModal({ open, onClose, initialClientId }: ScheduleShootsModalProps)/' components/shoots/schedule-shoot-modal.tsx
sed -i '' 's/open: boolean;/open: boolean;\n  initialClientId?: string | null;/' components/shoots/schedule-shoot-modal.tsx
sed -i '' 's/title="Bulk schedule emails"/title="Schedule shoots"/' components/shoots/schedule-shoot-modal.tsx
