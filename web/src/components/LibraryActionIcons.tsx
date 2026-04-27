import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

export function SearchIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <circle cx="10.5" cy="10.5" r="5.1" fill="none" stroke="currentColor" strokeWidth="1.9" />
      <path d="M14.35 14.35 18.8 18.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  )
}

export function FilterIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path
        d="M4.5 6.25h15l-5.65 6.35v5.15l-3.7 1.65V12.6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function NewNoteIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path d="M6 3.75h8.7l3.3 3.35v13.15H6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M14.7 3.75V7.1H18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M12 9.75v6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.75 13h6.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function NewDiagramIcon(props: IconProps) {
  return <NewNoteIcon {...props} />
}

export function NewFolderIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path
        d="M3.75 7.25A2.25 2.25 0 0 1 6 5h4.15l1.55 1.7H18A2.25 2.25 0 0 1 20.25 9v7.75A2.25 2.25 0 0 1 18 19H6a2.25 2.25 0 0 1-2.25-2.25Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M15.75 10.25v5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M13 13h5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path d="M12 4.75v10.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <path d="M8.6 8.35 12 4.75l3.4 3.6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 15.75v1.5c0 .83.67 1.5 1.5 1.5h9c.83 0 1.5-.67 1.5-1.5v-1.5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function RenameIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path
        d="M4.75 19.25h4.1l9.35-9.35-4.1-4.1-9.35 9.35v4.1Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="m12.95 6.95 4.1 4.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function MicrophoneIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className="notes-new-button-icon" aria-hidden="true" {...props}>
      <path
        d="M12 15.2a3.8 3.8 0 0 1-3.8-3.8V6.9a3.8 3.8 0 1 1 7.6 0v4.5a3.8 3.8 0 0 1-3.8 3.8Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="M6.7 10.9v.6a5.3 5.3 0 0 0 10.6 0v-.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M12 16.8v3.1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M9 19.9h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  )
}
