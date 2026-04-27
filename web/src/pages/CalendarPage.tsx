import { useEffect, useMemo, useState } from 'react'
import type { CalendarConnection, CalendarEvent, GoogleCalendarConfig, ResourceVisibility } from '../lib/types'

type Props = {
  currentUserId: string | null
  googleConfig: GoogleCalendarConfig | null
  connections: CalendarConnection[]
  selectedConnectionId: string | null
  events: CalendarEvent[]
  loading: boolean
  onSelectConnection: (id: string) => void
  onStartGoogleConnect: () => void
  onCreateIcsConnection: (title: string, url: string) => Promise<void>
  onCreateLocalConnection: (title: string) => Promise<void>
  onRenameConnection: (id: string, title: string) => Promise<void>
  onDeleteConnection: (id: string) => Promise<void>
  onRefresh: () => Promise<void>
  onCreateEvent: (payload: {
    title: string
    description: string
    location: string
    start_at: string
    end_at: string
    all_day: boolean
  }) => Promise<void>
  onUpdateEvent: (
    eventId: string,
    payload: {
      title: string
      description: string
      location: string
      start_at: string
      end_at: string
      all_day: boolean
    },
  ) => Promise<void>
  onDeleteEvent: (eventId: string) => Promise<void>
  onOpenShareDialog: (target: { resourceKey: string; label: string; visibility?: ResourceVisibility }) => void
  resourceKeyForCalendar: (connectionId: string) => string
}

function formatEventDayLabel(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp))
}

function formatEventTimeRange(event: CalendarEvent) {
  if (event.all_day) return 'All day'
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `${formatter.format(new Date(event.start_at))} - ${formatter.format(new Date(event.end_at))}`
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate()
}

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, monthIndex) => ({
  value: monthIndex,
  label: new Intl.DateTimeFormat(undefined, { month: 'long' }).format(new Date(2026, monthIndex, 1)),
}))

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16)
}

function fromDatetimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : ''
}

export function CalendarPage({
  currentUserId,
  googleConfig,
  connections,
  selectedConnectionId,
  events,
  loading,
  onSelectConnection,
  onStartGoogleConnect,
  onCreateIcsConnection,
  onCreateLocalConnection,
  onRenameConnection,
  onDeleteConnection,
  onRefresh,
  onCreateEvent,
  onUpdateEvent,
  onDeleteEvent,
  onOpenShareDialog,
  resourceKeyForCalendar,
}: Props) {
  const [searchQuery, setSearchQuery] = useState('')
  const [feedModalOpen, setFeedModalOpen] = useState(false)
  const [feedTitle, setFeedTitle] = useState('')
  const [feedUrl, setFeedUrl] = useState('')
  const [localModalOpen, setLocalModalOpen] = useState(false)
  const [localTitle, setLocalTitle] = useState('')
  const [renamingConnection, setRenamingConnection] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState(() => new Date())
  const [eventModalOpen, setEventModalOpen] = useState(false)
  const [editingEventId, setEditingEventId] = useState<string | null>(null)
  const [eventTitle, setEventTitle] = useState('')
  const [eventDescription, setEventDescription] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventStart, setEventStart] = useState('')
  const [eventEnd, setEventEnd] = useState('')
  const [eventAllDay, setEventAllDay] = useState(false)

  const selectedConnection = connections.find((connection) => connection.id === selectedConnectionId) ?? null
  const isSelectedOwnedByCurrentUser = selectedConnection?.owner_id === currentUserId
  const isSelectedLocalCalendar = selectedConnection?.provider === 'sweet'

  useEffect(() => {
    setRenameDraft(selectedConnection?.title ?? '')
    setRenamingConnection(false)
  }, [selectedConnection?.id, selectedConnection?.title])

  const filteredConnections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return connections
    return connections.filter((connection) =>
      [connection.title, connection.account_label, connection.owner_display_name].some((value) =>
        value.toLowerCase().includes(query),
      ),
    )
  }, [connections, searchQuery])

  const groupedEvents = useMemo(() => {
    const groups = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = new Date(event.start_at).toISOString().slice(0, 10)
      const current = groups.get(key) ?? []
      current.push(event)
      groups.set(key, current)
    }
    return Array.from(groups.entries())
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([day, items]) => ({ day, items }))
  }, [events])

  const monthDays = useMemo(() => {
    const firstDay = startOfMonth(visibleMonth)
    const start = new Date(firstDay)
    start.setDate(firstDay.getDate() - firstDay.getDay())
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start)
      date.setDate(start.getDate() + index)
      return date
    })
  }, [visibleMonth])

  const eventsByDay = useMemo(() => {
    const next = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const key = new Date(event.start_at).toISOString().slice(0, 10)
      const current = next.get(key) ?? []
      current.push(event)
      next.set(key, current)
    }
    return next
  }, [events])

  const selectedDayKey = selectedDay.toISOString().slice(0, 10)
  const selectedDayEvents = eventsByDay.get(selectedDayKey) ?? []
  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear()
    return Array.from({ length: 21 }, (_, index) => currentYear - 10 + index)
  }, [])

  function setVisibleMonthParts(month: number, year: number) {
    setVisibleMonth(startOfMonth(new Date(year, month, 1)))
  }

  function openCreateEventModal() {
    const start = new Date(selectedDay)
    start.setHours(9, 0, 0, 0)
    const end = new Date(start)
    end.setHours(10, 0, 0, 0)
    setEditingEventId(null)
    setEventTitle('')
    setEventDescription('')
    setEventLocation('')
    setEventStart(toDatetimeLocalValue(start.toISOString()))
    setEventEnd(toDatetimeLocalValue(end.toISOString()))
    setEventAllDay(false)
    setEventModalOpen(true)
  }

  function openEditEventModal(event: CalendarEvent) {
    setEditingEventId(event.id)
    setEventTitle(event.title)
    setEventDescription(event.description)
    setEventLocation(event.location)
    setEventStart(toDatetimeLocalValue(event.start_at))
    setEventEnd(toDatetimeLocalValue(event.end_at))
    setEventAllDay(event.all_day)
    setEventModalOpen(true)
  }

  return (
    <>
      {feedModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setFeedModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Add Apple/iCloud Calendar</h3>
            </div>
            <div className="modal-body">
              <label className="settings-field">
                <span>Title</span>
                <input className="input" value={feedTitle} onChange={(event) => setFeedTitle(event.target.value)} placeholder="Team calendar" />
              </label>
              <label className="settings-field">
                <span>ICS feed URL</span>
                <input className="input" value={feedUrl} onChange={(event) => setFeedUrl(event.target.value)} placeholder="webcal://..." />
              </label>
            </div>
            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setFeedModalOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  void onCreateIcsConnection(feedTitle, feedUrl).then(() => {
                    setFeedModalOpen(false)
                    setFeedTitle('')
                    setFeedUrl('')
                  })
                }}
              >
                Add calendar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {localModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setLocalModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>New calendar</h3>
            </div>
            <div className="modal-body">
              <label className="settings-field">
                <span>Title</span>
                <input className="input" value={localTitle} onChange={(event) => setLocalTitle(event.target.value)} placeholder="Operations" />
              </label>
            </div>
            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setLocalModalOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  void onCreateLocalConnection(localTitle).then(() => {
                    setLocalModalOpen(false)
                    setLocalTitle('')
                  })
                }}
              >
                Create calendar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {eventModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setEventModalOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{editingEventId ? 'Edit event' : 'New event'}</h3>
            </div>
            <div className="modal-body">
              <label className="settings-field">
                <span>Title</span>
                <input className="input" value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} />
              </label>
              <label className="settings-field">
                <span>Description</span>
                <textarea className="textarea" rows={3} value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} />
              </label>
              <label className="settings-field">
                <span>Location</span>
                <input className="input" value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} />
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={eventAllDay} onChange={(event) => setEventAllDay(event.target.checked)} />
                <span>All day</span>
              </label>
              <div className="settings-grid">
                <label className="settings-field">
                  <span>Start</span>
                  <input className="input" type="datetime-local" value={eventStart} onChange={(event) => setEventStart(event.target.value)} />
                </label>
                <label className="settings-field">
                  <span>End</span>
                  <input className="input" type="datetime-local" value={eventEnd} onChange={(event) => setEventEnd(event.target.value)} />
                </label>
              </div>
            </div>
            <div className="modal-actions">
              {editingEventId ? (
                <button className="button-secondary danger-button" type="button" onClick={() => void onDeleteEvent(editingEventId).then(() => setEventModalOpen(false))}>
                  Delete
                </button>
              ) : null}
              <button className="button-secondary" type="button" onClick={() => setEventModalOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  const payload = {
                    title: eventTitle,
                    description: eventDescription,
                    location: eventLocation,
                    start_at: fromDatetimeLocalValue(eventStart),
                    end_at: fromDatetimeLocalValue(eventEnd),
                    all_day: eventAllDay,
                  }
                  const action = editingEventId ? onUpdateEvent(editingEventId, payload) : onCreateEvent(payload)
                  void action.then(() => setEventModalOpen(false))
                }}
              >
                {editingEventId ? 'Save' : 'Add event'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="panel">
        <div className="calendar-manager">
          <aside className="file-sidebar calendar-sidebar">
            <div className="file-sidebar-header-row">
              <div className="calendar-connect-actions">
                <button className="calendar-connect-button" type="button" onClick={() => setLocalModalOpen(true)} disabled={loading}>
                  New Home Suite Home calendar
                </button>
                <button className="calendar-connect-button" type="button" onClick={onStartGoogleConnect} disabled={loading || !googleConfig?.enabled}>
                  Connect Google
                </button>
                <button className="calendar-connect-button" type="button" onClick={() => setFeedModalOpen(true)} disabled={loading}>
                  Add Apple/iCloud
                </button>
              </div>
            </div>
            <div className="calendar-sidebar-search">
              <input className="input" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search calendars" />
            </div>
            <div className="calendar-connection-list">
              {filteredConnections.length > 0 ? (
                filteredConnections.map((connection) => (
                  <button
                    key={connection.id}
                    className={`calendar-connection-row ${connection.id === selectedConnectionId ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => onSelectConnection(connection.id)}
                  >
                    <div className="calendar-connection-title-row">
                      <strong>{connection.title}</strong>
                      {connection.owner_id === currentUserId ? <span className="tag">Yours</span> : <span className="tag">{connection.owner_display_name}</span>}
                    </div>
                    <div className="calendar-connection-meta">
                      <span>{connection.provider === 'google' ? 'Google' : connection.provider === 'ics' ? 'Apple/iCloud' : 'Home Suite Home'}</span>
                      <span>{connection.account_label}</span>
                    </div>
                  </button>
                ))
              ) : (
                <div className="empty-state">{searchQuery.trim() ? 'No matching calendars.' : 'Create a Home Suite Home calendar or connect an external one.'}</div>
              )}
            </div>
          </aside>

          <div className="calendar-content">
            <div className="calendar-pane">
              <div className="calendar-pane-header">
                <div>
                  {selectedConnection ? (
                    renamingConnection ? (
                      <input
                        className="input"
                        value={renameDraft}
                        onChange={(event) => setRenameDraft(event.target.value)}
                        onBlur={() => {
                          if (!selectedConnection) return
                          void onRenameConnection(selectedConnection.id, renameDraft)
                          setRenamingConnection(false)
                        }}
                        onKeyDown={(event) => {
                          if (!selectedConnection) return
                          if (event.key === 'Enter') {
                            void onRenameConnection(selectedConnection.id, renameDraft)
                            setRenamingConnection(false)
                          } else if (event.key === 'Escape') {
                            setRenameDraft(selectedConnection.title)
                            setRenamingConnection(false)
                          }
                        }}
                        autoFocus
                      />
                    ) : (
                      <h2>{selectedConnection.title}</h2>
                    )
                  ) : (
                    <h2>Calendar</h2>
                  )}
                  <p className="muted">
                    {selectedConnection
                      ? `${selectedConnection.provider === 'google' ? 'Google Calendar' : selectedConnection.provider === 'ics' ? 'Apple/iCloud feed' : 'Home Suite Home calendar'} · ${selectedConnection.account_label}`
                      : ''}
                  </p>
                </div>
                <div className="button-row">
                  <button className="button-secondary" type="button" onClick={() => setVisibleMonth(startOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)))}>
                    Prev
                  </button>
                  <button className="button-secondary" type="button" onClick={() => { setVisibleMonth(startOfMonth(new Date())); setSelectedDay(new Date()) }}>
                    Today
                  </button>
                  <button className="button-secondary" type="button" onClick={() => setVisibleMonth(startOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)))}>
                    Next
                  </button>
                  {selectedConnection ? (
                    <>
                      <button className="button-secondary" type="button" onClick={() => void onRefresh()}>
                        Refresh
                      </button>
                      {isSelectedLocalCalendar && isSelectedOwnedByCurrentUser ? (
                        <button className="button" type="button" onClick={openCreateEventModal}>
                          New event
                        </button>
                      ) : null}
                      {isSelectedOwnedByCurrentUser ? (
                        <>
                          <button className="button-secondary" type="button" onClick={() => setRenamingConnection(true)}>
                            Rename
                          </button>
                          <button className="button-secondary" type="button" onClick={() => onOpenShareDialog({ resourceKey: resourceKeyForCalendar(selectedConnection.id), label: selectedConnection.title })}>
                            Visibility
                          </button>
                          <button className="button-secondary danger-button" type="button" onClick={() => void onDeleteConnection(selectedConnection.id)}>
                            Delete
                          </button>
                        </>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              <div className="calendar-month-header">
                <button
                  className="calendar-month-arrow"
                  type="button"
                  aria-label="Previous month"
                  onClick={() => setVisibleMonth(startOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() - 1, 1)))}
                >
                  ←
                </button>
                <div className="calendar-month-controls">
                  <label className="calendar-month-picker">
                    <span className="sr-only">Select month</span>
                    <select
                      className="input calendar-month-select"
                      value={visibleMonth.getMonth()}
                      onChange={(event) => setVisibleMonthParts(Number(event.target.value), visibleMonth.getFullYear())}
                    >
                      {MONTH_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="calendar-year-picker">
                    <span className="sr-only">Select year</span>
                    <select
                      className="input calendar-year-select"
                      value={visibleMonth.getFullYear()}
                      onChange={(event) => setVisibleMonthParts(visibleMonth.getMonth(), Number(event.target.value))}
                    >
                      {yearOptions.map((year) => (
                        <option key={year} value={year}>
                          {year}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  className="calendar-month-arrow"
                  type="button"
                  aria-label="Next month"
                  onClick={() => setVisibleMonth(startOfMonth(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 1)))}
                >
                  →
                </button>
              </div>

              <div className="calendar-grid-frame">
                <div className="calendar-grid calendar-grid-weekdays">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label) => (
                    <div key={label} className="calendar-weekday-cell">
                      {label}
                    </div>
                  ))}
                </div>
                <div className="calendar-grid calendar-grid-days">
                  {monthDays.map((day) => {
                    const key = day.toISOString().slice(0, 10)
                    const dayEvents = eventsByDay.get(key) ?? []
                    const outsideMonth = day.getMonth() !== visibleMonth.getMonth()
                    return (
                      <button key={key} type="button" className={`calendar-day-cell ${outsideMonth ? 'is-outside-month' : ''} ${sameDay(day, selectedDay) ? 'is-selected' : ''}`} onClick={() => setSelectedDay(day)}>
                        <div className="calendar-day-number">{day.getDate()}</div>
                        <div className="calendar-day-preview-list">
                          {dayEvents.slice(0, 3).map((event) => (
                            <div key={event.id} className="calendar-day-preview-item">
                              {event.title}
                            </div>
                          ))}
                          {dayEvents.length > 3 ? <div className="calendar-day-preview-more">+{dayEvents.length - 3} more</div> : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="calendar-agenda">
                <section className="calendar-day-group">
                  <div className="calendar-pane-header">
                    <h3>{formatEventDayLabel(selectedDay.toISOString())}</h3>
                    {isSelectedLocalCalendar && isSelectedOwnedByCurrentUser ? (
                      <button className="button-secondary" type="button" onClick={openCreateEventModal}>
                        Add event
                      </button>
                    ) : null}
                  </div>
                  {selectedDayEvents.length === 0 ? (
                    <div className="empty-state">
                      {selectedConnection ? 'No events on this day.' : 'No events yet. Create a Home Suite Home calendar or connect an external one.'}
                    </div>
                  ) : (
                    <div className="calendar-event-list">
                      {selectedDayEvents.map((event) => (
                        <article
                          key={event.id}
                          className={`calendar-event-card ${isSelectedLocalCalendar && !event.id.startsWith('task:') ? 'is-editable' : ''}`}
                          onClick={() => {
                            if (isSelectedLocalCalendar && !event.id.startsWith('task:')) {
                              openEditEventModal(event)
                            }
                          }}
                        >
                          <div className="calendar-event-time">{formatEventTimeRange(event)}</div>
                          <div className="calendar-event-main">
                            <strong>{event.title}</strong>
                            {event.location ? <span className="muted">{event.location}</span> : null}
                            {event.description ? <span className="muted">{event.description}</span> : null}
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {groupedEvents.length > 0 ? (
                  <section className="calendar-day-group">
                    <h3>Upcoming</h3>
                    <div className="calendar-event-list">
                      {groupedEvents.slice(0, 8).map((group) => (
                        <article key={group.day} className="calendar-upcoming-card">
                          <strong>{formatEventDayLabel(group.day)}</strong>
                          <span className="muted">{group.items.length} event{group.items.length === 1 ? '' : 's'}</span>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
