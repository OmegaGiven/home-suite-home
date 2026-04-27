import { useEffect, useMemo, useRef, useState } from 'react'
import type { CalendarConnection, TaskItem, TaskStatus } from '../lib/types'

type Props = {
  tasks: TaskItem[]
  selectedTaskId: string | null
  calendars: CalendarConnection[]
  onSelectTask: (id: string) => void
  onCreateTask: (payload: {
    title: string
    description: string
    start_at?: string | null
    end_at?: string | null
    all_day: boolean
    calendar_connection_id?: string | null
  }) => Promise<void>
  onUpdateTask: (
    id: string,
    payload: {
      title: string
      description: string
      status: TaskStatus
      start_at?: string | null
      end_at?: string | null
      all_day: boolean
      calendar_connection_id?: string | null
    },
  ) => Promise<void>
  onDeleteTask: (id: string) => Promise<void>
}

function toDatetimeLocalValue(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const local = new Date(date.getTime() - offset * 60_000)
  return local.toISOString().slice(0, 16)
}

function fromDatetimeLocalValue(value: string) {
  return value ? new Date(value).toISOString() : null
}

export function TasksPage({
  tasks,
  selectedTaskId,
  calendars,
  onSelectTask,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
}: Props) {
  const [createOpen, setCreateOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState('')
  const [endAt, setEndAt] = useState('')
  const [allDay, setAllDay] = useState(false)
  const [calendarId, setCalendarId] = useState('')

  const localCalendars = useMemo(
    () => calendars.filter((connection) => connection.provider === 'sweet'),
    [calendars],
  )
  const selectedTaskRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    selectedTaskRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedTaskId])

  return (
    <>
      {createOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={() => setCreateOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>New task</h3>
            </div>
            <div className="modal-body">
              <label className="settings-field">
                <span>Title</span>
                <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
              </label>
              <label className="settings-field">
                <span>Description</span>
                <textarea className="textarea" value={description} onChange={(event) => setDescription(event.target.value)} rows={4} />
              </label>
              <label className="settings-check">
                <input type="checkbox" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
                <span>All day</span>
              </label>
              <div className="settings-grid">
                <label className="settings-field">
                  <span>Start</span>
                  <input className="input" type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
                </label>
                <label className="settings-field">
                  <span>End</span>
                  <input className="input" type="datetime-local" value={endAt} onChange={(event) => setEndAt(event.target.value)} />
                </label>
              </div>
              <label className="settings-field">
                <span>Calendar</span>
                <select className="select" value={calendarId} onChange={(event) => setCalendarId(event.target.value)}>
                  <option value="">None</option>
                  {localCalendars.map((calendar) => (
                    <option key={calendar.id} value={calendar.id}>
                      {calendar.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button className="button-secondary" type="button" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="button"
                onClick={() => {
                  void onCreateTask({
                    title,
                    description,
                    start_at: fromDatetimeLocalValue(startAt),
                    end_at: fromDatetimeLocalValue(endAt),
                    all_day: allDay,
                    calendar_connection_id: calendarId || null,
                  }).then(() => {
                    setCreateOpen(false)
                    setTitle('')
                    setDescription('')
                    setStartAt('')
                    setEndAt('')
                    setAllDay(false)
                    setCalendarId('')
                  })
                }}
              >
                Add task
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <section className="panel">
        <div className="tasks-panel">
          <div className="panel-header">
            <div>
              <h2>Tasks</h2>
            </div>
            <div className="button-row">
              <button className="button" type="button" onClick={() => setCreateOpen(true)}>
                New task
              </button>
            </div>
          </div>
          <div className="tasks-list">
            {tasks.length > 0 ? (
              tasks.map((task) => (
                <article
                  key={task.id}
                  ref={task.id === selectedTaskId ? selectedTaskRef : null}
                  className={`tasks-card ${task.status === 'completed' ? 'is-completed' : ''} ${task.id === selectedTaskId ? 'is-selected' : ''}`}
                  onClick={() => onSelectTask(task.id)}
                >
                  <div className="tasks-card-main">
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={task.status === 'completed'}
                        onChange={(event) => {
                          void onUpdateTask(task.id, {
                            title: task.title,
                            description: task.description,
                            status: event.target.checked ? 'completed' : 'open',
                            start_at: task.start_at ?? null,
                            end_at: task.end_at ?? null,
                            all_day: task.all_day,
                            calendar_connection_id: task.calendar_connection_id ?? null,
                          })
                        }}
                      />
                      <span>Done</span>
                    </label>
                    <input
                      className="input tasks-title-input"
                      value={task.title}
                      onChange={(event) => {
                        void onUpdateTask(task.id, {
                          title: event.target.value,
                          description: task.description,
                          status: task.status,
                          start_at: task.start_at ?? null,
                          end_at: task.end_at ?? null,
                          all_day: task.all_day,
                          calendar_connection_id: task.calendar_connection_id ?? null,
                        })
                      }}
                    />
                    <button className="button-secondary danger-button" type="button" onClick={() => void onDeleteTask(task.id)}>
                      Delete
                    </button>
                  </div>
                  <textarea
                    className="textarea tasks-description"
                    rows={3}
                    value={task.description}
                    onChange={(event) => {
                      void onUpdateTask(task.id, {
                        title: task.title,
                        description: event.target.value,
                        status: task.status,
                        start_at: task.start_at ?? null,
                        end_at: task.end_at ?? null,
                        all_day: task.all_day,
                        calendar_connection_id: task.calendar_connection_id ?? null,
                      })
                    }}
                  />
                  <div className="tasks-card-meta">
                    <label className="settings-check">
                      <input
                        type="checkbox"
                        checked={task.all_day}
                        onChange={(event) => {
                          void onUpdateTask(task.id, {
                            title: task.title,
                            description: task.description,
                            status: task.status,
                            start_at: task.start_at ?? null,
                            end_at: task.end_at ?? null,
                            all_day: event.target.checked,
                            calendar_connection_id: task.calendar_connection_id ?? null,
                          })
                        }}
                      />
                      <span>All day</span>
                    </label>
                    <input
                      className="input"
                      type="datetime-local"
                      value={toDatetimeLocalValue(task.start_at)}
                      onChange={(event) => {
                        void onUpdateTask(task.id, {
                          title: task.title,
                          description: task.description,
                          status: task.status,
                          start_at: fromDatetimeLocalValue(event.target.value),
                          end_at: task.end_at ?? null,
                          all_day: task.all_day,
                          calendar_connection_id: task.calendar_connection_id ?? null,
                        })
                      }}
                    />
                    <input
                      className="input"
                      type="datetime-local"
                      value={toDatetimeLocalValue(task.end_at)}
                      onChange={(event) => {
                        void onUpdateTask(task.id, {
                          title: task.title,
                          description: task.description,
                          status: task.status,
                          start_at: task.start_at ?? null,
                          end_at: fromDatetimeLocalValue(event.target.value),
                          all_day: task.all_day,
                          calendar_connection_id: task.calendar_connection_id ?? null,
                        })
                      }}
                    />
                    <select
                      className="select"
                      value={task.calendar_connection_id ?? ''}
                      onChange={(event) => {
                        void onUpdateTask(task.id, {
                          title: task.title,
                          description: task.description,
                          status: task.status,
                          start_at: task.start_at ?? null,
                          end_at: task.end_at ?? null,
                          all_day: task.all_day,
                          calendar_connection_id: event.target.value || null,
                        })
                      }}
                    >
                      <option value="">No calendar</option>
                      {localCalendars.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </article>
              ))
            ) : (
              <div className="empty-state">No tasks yet.</div>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
