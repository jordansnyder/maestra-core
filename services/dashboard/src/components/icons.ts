import type { LucideIcon } from 'lucide-react'

// Navigation
export {
  LayoutDashboard,
  Boxes,
  Monitor,
  GitFork,
} from 'lucide-react'

// Device types
export {
  Cpu,
  Server,
  Radio,
  Palette,
  Music,
  Gamepad2,
  Globe,
  Smartphone,
} from 'lucide-react'

// Entity types
export {
  Building2,
  DoorOpen,
  MapPin,
  Sparkles,
  MonitorSmartphone,
  Radar,
  Zap,
  SlidersHorizontal,
  Play,
  FolderOpen,
  Package,
} from 'lucide-react'

// Stats
export {
  Activity,
  CheckCircle2,
  PauseCircle,
  AlertTriangle,
} from 'lucide-react'

// External services
export {
  Workflow,
  BarChart3,
  FileCode,
  Container,
  Route,
  ExternalLink,
} from 'lucide-react'

// System health
export {
  Database,
  MessageSquare,
  Wifi,
  Heart,
} from 'lucide-react'

// Toast / UI
export {
  XCircle,
  Info,
} from 'lucide-react'

// Misc UI
export {
  Plus,
  Pencil,
  Trash2,
  X,
  ChevronRight,
  Search,
  RefreshCw,
  Settings,
  ChevronDown,
} from 'lucide-react'

// Device type icon lookup
import {
  Cpu,
  Server,
  Radio,
  Palette,
  Music,
  Gamepad2,
  Globe,
  Smartphone,
  Package,
  Building2,
  DoorOpen,
  MapPin,
  Sparkles,
  MonitorSmartphone,
  Radar,
  Zap,
  SlidersHorizontal,
  Play,
  FolderOpen,
} from 'lucide-react'

export const DEVICE_TYPE_ICONS: Record<string, LucideIcon> = {
  arduino: Cpu,
  raspberry_pi: Server,
  esp32: Radio,
  touchdesigner: Palette,
  max_msp: Music,
  unreal_engine: Gamepad2,
  web_client: Globe,
  mobile_client: Smartphone,
}

export const ENTITY_TYPE_ICONS: Record<string, LucideIcon> = {
  space: Building2,
  room: DoorOpen,
  zone: MapPin,
  installation: Sparkles,
  device: MonitorSmartphone,
  sensor: Radar,
  actuator: Zap,
  controller: SlidersHorizontal,
  media: Play,
  group: FolderOpen,
}

export const DEFAULT_DEVICE_ICON = Package
export const DEFAULT_ENTITY_ICON = Package
