import React from 'react';
// Deep imports keep the bundle to just the icons we use (webpack runs in
// development mode, so importing the package root would pull in all ~4k).
import MousePointer2 from 'lucide-react/dist/esm/icons/mouse-pointer-2.mjs';
import Slash from 'lucide-react/dist/esm/icons/slash.mjs';
import Square from 'lucide-react/dist/esm/icons/square.mjs';
import Spline from 'lucide-react/dist/esm/icons/spline.mjs';
import Circle from 'lucide-react/dist/esm/icons/circle.mjs';
import Radius from 'lucide-react/dist/esm/icons/radius.mjs';
import Minus from 'lucide-react/dist/esm/icons/minus.mjs';
import Grid3x3 from 'lucide-react/dist/esm/icons/grid-3x3.mjs';
import Type from 'lucide-react/dist/esm/icons/type.mjs';
import Ruler from 'lucide-react/dist/esm/icons/ruler.mjs';
import PencilRuler from 'lucide-react/dist/esm/icons/pencil-ruler.mjs';
import Zap from 'lucide-react/dist/esm/icons/zap.mjs';
import Router from 'lucide-react/dist/esm/icons/router.mjs';
import Network from 'lucide-react/dist/esm/icons/network.mjs';
import Plug from 'lucide-react/dist/esm/icons/plug.mjs';
import FlipHorizontal2 from 'lucide-react/dist/esm/icons/flip-horizontal-2.mjs';
import Grid2x2 from 'lucide-react/dist/esm/icons/grid-2x2.mjs';
import Copy from 'lucide-react/dist/esm/icons/copy.mjs';
import AlignDist from 'lucide-react/dist/esm/icons/align-horizontal-distribute-center.mjs';
import CornerDownRight from 'lucide-react/dist/esm/icons/corner-down-right.mjs';
import Group from 'lucide-react/dist/esm/icons/group.mjs';
import Ungroup from 'lucide-react/dist/esm/icons/ungroup.mjs';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2.mjs';
import ZoomIn from 'lucide-react/dist/esm/icons/zoom-in.mjs';
import ZoomOut from 'lucide-react/dist/esm/icons/zoom-out.mjs';
import Maximize from 'lucide-react/dist/esm/icons/maximize.mjs';
import Box from 'lucide-react/dist/esm/icons/box.mjs';
import FileText from 'lucide-react/dist/esm/icons/file-text.mjs';
import ImageIcon from 'lucide-react/dist/esm/icons/image.mjs';
import ClipboardList from 'lucide-react/dist/esm/icons/clipboard-list.mjs';
import ListOrdered from 'lucide-react/dist/esm/icons/list-ordered.mjs';
import Settings from 'lucide-react/dist/esm/icons/settings.mjs';
import Play from 'lucide-react/dist/esm/icons/play.mjs';
import SlidersHorizontal from 'lucide-react/dist/esm/icons/sliders-horizontal.mjs';
import User from 'lucide-react/dist/esm/icons/user.mjs';
import Lock from 'lucide-react/dist/esm/icons/lock.mjs';
import Magnet from 'lucide-react/dist/esm/icons/magnet.mjs';
import ChevronRight from 'lucide-react/dist/esm/icons/chevron-right.mjs';
import Tag from 'lucide-react/dist/esm/icons/tag.mjs';
import Search from 'lucide-react/dist/esm/icons/search.mjs';
import Command from 'lucide-react/dist/esm/icons/command.mjs';
import X from 'lucide-react/dist/esm/icons/x.mjs';

const ICONS = {
  select: MousePointer2, line: Slash, rect: Square, polyline: Spline, circle: Circle, arc: Radius,
  pipe: Minus, truss: Grid3x3, text: Type, dimension: Ruler, calibrate: PencilRuler,
  'infra-distro': Zap, 'infra-node': SlidersHorizontal, 'infra-switch': Network, 'infra-netport': Plug,
  router: Router,
  mirror: FlipHorizontal2, array: Grid2x2, offset: Copy, align: AlignDist, corner: CornerDownRight,
  group: Group, ungroup: Ungroup, delete: Trash2,
  zoomin: ZoomIn, zoomout: ZoomOut, fit: Maximize, grid: Grid3x3, view3d: Box,
  pdf: FileText, image: ImageIcon, patch: Zap, fixtures: ClipboardList, channels: ListOrdered,
  studio: Settings, anim: Play, report: ClipboardList, eos: SlidersHorizontal,
  user: User, lock: Lock, snap: Magnet, more: ChevronRight, labels: Tag,
  search: Search, command: Command, close: X,
};

// <Icon name="select" size={16} /> — stroke uses currentColor, so icons pick
// up the button's text colour (and therefore the theme and active state).
export default function Icon({ name, size = 16, strokeWidth = 1.75, style, ...rest }) {
  const C = ICONS[name];
  if (!C) return null;
  return <C size={size} strokeWidth={strokeWidth} aria-hidden="true" focusable="false" style={{ flexShrink: 0, ...style }} {...rest} />;
}
