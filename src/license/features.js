/**
 * App-defined feature flags. These are the units that rights groups can enable/disable.
 * The groups editor in LicenseManager lets admins choose which of these a group grants.
 */
export const FEATURES = [
  { id: 'cad_view',        label: 'View CAD drawings',                   group: 'Canvas' },
  { id: 'cad_edit',        label: 'Edit / draw on canvas',               group: 'Canvas' },
  { id: 'beam_footprints', label: 'Beam angle footprints',               group: 'Canvas' },
  { id: 'fixture_library', label: 'Fixture library panel',               group: 'Library' },
  { id: 'gdtf_browser',    label: 'GDTF Share browser',                  group: 'Library' },
  { id: 'patch_panel',     label: 'DMX patch panel',                     group: 'Patch & Reports' },
  { id: 'reports',         label: 'Reports (instrument, channel, dimmer)', group: 'Patch & Reports' },
  { id: 'cable_routing',   label: 'Cable routing & power calculations',  group: 'Patch & Reports' },
  { id: 'mvr_import',      label: 'Import MVR files',                    group: 'Import / Export' },
  { id: 'mvr_export',      label: 'Export (MVR / PNG / SVG)',            group: 'Import / Export' },
  { id: 'eos_import',      label: 'EOS showfile import',                 group: 'Import / Export' },
  { id: 'pdf_background',  label: 'PDF / image backgrounds',             group: 'Import / Export' },
  { id: 'multi_drawing',   label: 'Multiple drawings & tabs',            group: 'Advanced' },
  { id: 'sheet_editor',    label: 'Sheet editor',                        group: 'Advanced' },
  { id: 'license_manager', label: 'License Manager (write access)',      group: 'Developer' },
];

/** All feature IDs — shorthand for "grant everything" */
export const ALL_FEATURE_IDS = FEATURES.map(f => f.id);
