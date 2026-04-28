import type { ReactNode } from 'react'
import Svg, { Circle, Path } from 'react-native-svg'

type IconProps = {
  color?: string
  size?: number
}

function iconSize(size = 20) {
  return { width: size, height: size }
}

export function SaveStateIcon({ color = 'currentColor', size = 20 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...iconSize(size)}>
      <Path d="M5 3.75h11.25l3 3V20.25H5z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M7.25 4.9h7.15v4.15H7.25z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M11.15 5.85h1.35v2.25h-1.35z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
      <Path d="M7.6 11.6h8.8v5.65H7.6z" fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" />
    </Svg>
  )
}

export function VisibilityIcon({ color = 'currentColor', size = 20 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...iconSize(size)}>
      <Path
        d="M2.75 12s3.35-5.5 9.25-5.5 9.25 5.5 9.25 5.5-3.35 5.5-9.25 5.5S2.75 12 2.75 12Z"
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <Circle cx="12" cy="12" r="2.9" fill="none" stroke={color} strokeWidth={1.8} />
    </Svg>
  )
}

export function TocIcon({ color = 'currentColor', size = 20 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...iconSize(size)}>
      <Path d="M5 7h2" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M10 7h9" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M5 12h2" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M10 12h7" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M5 17h2" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M10 17h5" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  )
}

export function LinkIcon({ color = 'currentColor', size = 20 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...iconSize(size)}>
      <Path
        d="M10.6 13.4a3 3 0 0 0 4.24 0l3.18-3.18a3 3 0 0 0-4.24-4.24l-1.77 1.77M13.4 10.6a3 3 0 0 0-4.24 0l-3.18 3.18a3 3 0 0 0 4.24 4.24l1.77-1.77"
        fill="none"
        stroke={color}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

export function HamburgerIcon({ color = 'currentColor', size = 20 }: IconProps) {
  return (
    <Svg viewBox="0 0 24 24" {...iconSize(size)}>
      <Path d="M5 7h14" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M5 12h14" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
      <Path d="M5 17h14" fill="none" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  )
}

export function ToolbarGlyph({ children }: { children: ReactNode }) {
  return <>{children}</>
}
