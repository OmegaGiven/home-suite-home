import { useMemo, useState } from 'react'
import { api } from '../lib/api'
import type { UserProfile } from '../lib/types'

type AvatarUser = Pick<UserProfile, 'id' | 'username' | 'display_name' | 'avatar_path'>

type Props = {
  user: AvatarUser
  className?: string
  title?: string
}

function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0
  }
  return Math.abs(hash)
}

function avatarInitial(user: AvatarUser) {
  const source = user.display_name?.trim() || user.username?.trim() || '?'
  return source.charAt(0).toUpperCase()
}

function avatarColors(user: AvatarUser) {
  const hash = hashString(`${user.id}:${user.username}:${user.display_name}`)
  const hue = hash % 360
  const background = `hsl(${hue} 38% 16%)`
  const color = `hsl(${hue} 88% 72%)`
  const border = `hsl(${hue} 72% 46% / 0.45)`
  return { background, color, border }
}

export function UserAvatar({ user, className = '', title }: Props) {
  const [imageFailed, setImageFailed] = useState(false)
  const colors = useMemo(() => avatarColors(user), [user])
  const label = title || user.display_name || user.username
  const imageUrl = user.avatar_path && !imageFailed ? api.userAvatarUrl(user.id, user.avatar_path) : null

  return (
    <span
      className={`user-avatar ${className}`.trim()}
      title={label}
      aria-label={label}
      style={
        imageUrl
          ? undefined
          : {
              ['--avatar-bg' as string]: colors.background,
              ['--avatar-fg' as string]: colors.color,
              ['--avatar-border' as string]: colors.border,
            }
      }
    >
      {imageUrl ? (
        <img
          className="user-avatar-image"
          src={imageUrl}
          alt=""
          aria-hidden="true"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="user-avatar-initial" aria-hidden="true">
          {avatarInitial(user)}
        </span>
      )}
    </span>
  )
}
