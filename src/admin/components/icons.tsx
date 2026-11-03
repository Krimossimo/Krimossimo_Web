import type { SVGProps } from 'react'

/** Icônes de la navigation d'administration (trait 1.75, 24 px, héritent de la couleur du texte). */
type IconProps = SVGProps<SVGSVGElement>

function Icon({ children, ...props }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {children}
    </svg>
  )
}

export const OverviewIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="4.5" rx="1.5" />
    <rect x="13.5" y="11" width="7" height="9.5" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
)
export const ProjectsIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
)
export const ShopIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 8h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3z" />
    <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
  </Icon>
)
export const GamesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 8h9a4.5 4.5 0 0 1 4.4 5.4l-.6 3a2.4 2.4 0 0 1-4.2 1L14.5 15.5h-5L7.9 17.4a2.4 2.4 0 0 1-4.2-1l-.6-3A4.5 4.5 0 0 1 7.5 8z" />
    <path d="M8 11v3M6.5 12.5h3M15.5 12h.01M17.5 13.5h.01" />
  </Icon>
)
export const OrdersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
    <path d="M9 8.5h6M9 12h6" />
  </Icon>
)
export const MessagesIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
    <path d="m4 7 8 6 8-6" />
  </Icon>
)
export const AccountIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 20a7 7 0 0 1 14 0" />
  </Icon>
)
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4.5h5.5V10M19.5 4.5 11 13M17 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 4 18.5v-10A1.5 1.5 0 0 1 5.5 7H10" />
  </Icon>
)
export const SignOutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14M10 12h10M17 8.5l3.5 3.5-3.5 3.5" />
  </Icon>
)
export const ImageIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <circle cx="9" cy="9.5" r="1.75" />
    <path d="m20.5 16-4.5-4.5-9 8" />
  </Icon>
)
