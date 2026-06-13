/**
 * App-defined feature flags. These are the units that rights groups can enable/disable.
 * The groups editor in LicenseManager lets admins choose which of these a group grants.
 *
 * Every gated capability in the app should appear here so it gets a permission
 * tickbox in the License Manager's rights-group editor.
 */
export const FEATURES = [
  // ── Canvas ──────────────────────────────────────────────────────────────
  { id: 'cad_view',        label: 'View CAD drawings',                   group: 'Canvas' },
  { id: 'cad_edit',        label: 'Edit / draw on canvas',               group: 'Canvas' },
  { id: 'beam_footprints', label: 'Beam angle footprints',               group: 'Canvas' },
  { id: 'dimensioning',    label: 'Dimension / measure tool',            group: 'Canvas' },

  // ── Library ─────────────────────────────────────────────────────────────
  { id: 'fixture_library', label: 'Fixture library panel',               group: 'Library' },
  { id: 'gdtf_browser',    label: 'GDTF Share browser',                  group: 'Library' },
  { id: 'fixture_swap',    label: 'Swap fixture type',                   group: 'Library' },

  // ── Patch & Reports ───────────────────────────────────────────────────────
  { id: 'patch_panel',     label: 'DMX patch panel',                     group: 'Patch & Reports' },
  { id: 'reports',         label: 'Reports (fixture, channel)',          group: 'Patch & Reports' },
  { id: 'universe_view',   label: 'Universe overview',                   group: 'Patch & Reports' },
  { id: 'cable_routing',   label: 'Cable routing & power calculations',  group: 'Patch & Reports' },

  // ── Import / Export ───────────────────────────────────────────────────────
  { id: 'mvr_import',      label: 'Import MVR files',                    group: 'Import / Export' },
  { id: 'mvr_export',      label: 'Export (MVR / PNG / SVG)',            group: 'Import / Export' },
  { id: 'eos_import',      label: 'EOS showfile import',                 group: 'Import / Export' },
  { id: 'pdf_background',  label: 'PDF / image backgrounds',             group: 'Import / Export' },

  // ── Workflow ──────────────────────────────────────────────────────────────
  { id: 'multi_drawing',   label: 'Multiple drawings & tabs',            group: 'Workflow' },
  { id: 'sheet_editor',    label: 'Sheet editor',                        group: 'Workflow' },
  { id: 'templates',       label: 'Project & drawing templates',         group: 'Workflow' },
  { id: 'revisions',       label: 'Revision history',                    group: 'Workflow' },
  { id: 'undo_history',    label: 'Undo history panel',                  group: 'Workflow' },
  { id: 'auto_save',       label: 'Auto-save & recovery',                group: 'Workflow' },

  // ── Developer ───────────────────────────────────────────────────────────
  { id: 'license_manager', label: 'License Manager (write access)',      group: 'Developer' },
  { id: 'dev_tools',       label: 'Toggle Developer Tools',              group: 'Developer' },
];

/** All feature IDs — shorthand for "grant everything" */
export const ALL_FEATURE_IDS = FEATURES.map(f => f.id);
