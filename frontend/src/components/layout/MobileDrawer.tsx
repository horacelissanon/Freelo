'use client';

// Alternative to BottomNav for mobile — opt-in via Paramètres → Espace →
// Navigation mobile. Slides the same Sidebar content in from the left
// (rather than duplicating the nav-item list) so a freelance who switches
// between the two styles never sees a different menu, just a different way
// to reach it. Sidebar already accepts `onNavigate` (used elsewhere to
// collapse a menu after a tap) which this reuses to auto-close the drawer.
import { Sidebar } from '@/components/layout/Sidebar';
import type { SidebarShape } from '@/contexts/SidebarShapeContext';

export function MobileDrawer({
  open,
  onClose,
  shape,
}: {
  open: boolean;
  onClose: () => void;
  shape: SidebarShape;
}) {
  if (!open) return null;

  return (
    <>
      <button
        type="button"
        aria-label="Fermer le menu"
        onClick={onClose}
        className="animate-fade-in fixed inset-0 z-40 bg-black/40 lg:hidden"
      />
      <div className="animate-slide-in-left fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] p-3 lg:hidden">
        <Sidebar onNavigate={onClose} shape={shape} />
      </div>
    </>
  );
}
