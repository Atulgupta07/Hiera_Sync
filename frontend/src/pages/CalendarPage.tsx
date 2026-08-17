import { useEffect, useMemo, useState } from "react";
import { eventsApi, employeesApi, aiApi } from "../api";
import { EventResponse, EmployeeResponse } from "../types";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import "./CalendarPage.css";

type ActivityType =
  | "Academic"
  | "Meeting"
  | "Workshop"
  | "Department Activity"
  | "Research";

interface FormState {
  title: string;
  date: string;
  type: ActivityType;
  person: string;
  description: string;
  location: string;
}

const emptyForm: FormState = {
  title: "",
  date: "",
  type: "Academic",
  person: "",
  description: "",
  location: "",
};

const typeIcons: Record<ActivityType, string> = {
  Academic: "📚",
  Meeting: "👥",
  Workshop: "🎓",
  "Department Activity": "🏫",
  Research: "🔬",
};

const typeClass: Record<ActivityType, string> = {
  Academic: "academic",
  Meeting: "meeting",
  Workshop: "workshop",
  "Department Activity": "department",
  Research: "research",
};

export default function CalendarPage() {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [facultyList, setFacultyList] = useState<EmployeeResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] =
    useState<EventResponse | null>(null);

  const [selectedDate, setSelectedDate] = useState("");

  const [deleting, setDeleting] = useState(false);

  const [aiMessage, setAiMessage] = useState(
    "Your academic schedule is organized. I can help identify upcoming deadlines and overloaded days."
  );

  const [form, setForm] = useState<FormState>(emptyForm);

  const role = useMemo(() => {
    const storedRole =
      localStorage.getItem("role") ||
      localStorage.getItem("userRole") ||
      localStorage.getItem("user_role");

    if (!storedRole) return "ADMIN";

    return storedRole.toUpperCase();
  }, []);

  const isHodOrAdmin =
    role.includes("ADMIN") ||
    role.includes("HOD") ||
    role.includes("HEAD");

  useEffect(() => {
    loadCalendar();
  }, []);

  /* =========================================================
     LOAD CALENDAR
     ========================================================= */

  const loadCalendar = async () => {
    try {
      setLoading(true);
      setError("");

      const [eventData, facultyData] = await Promise.all([
        eventsApi.getAll(),
        employeesApi.getAll(),
      ]);

      setEvents(eventData);
      setFacultyList(facultyData);

      try {
        const insight = await aiApi.getCalendarInsights();

        if (insight?.message) {
          setAiMessage(insight.message);
        }
      } catch {
        // AI is optional
      }
    } catch (err: any) {
      setError(err?.message || "Unable to load calendar data.");
    } finally {
      setLoading(false);
    }
  };

  /* =========================================================
     CREATE MODAL
     ========================================================= */

  const openCreateModal = (date?: string) => {
    if (!isHodOrAdmin) {
      alert(
        "Only HOD / Administrator can create department activities."
      );
      return;
    }

    const activityDate = date || "";

    setSelectedDate(activityDate);

    setForm({
      ...emptyForm,
      date: activityDate,
    });

    setShowCreate(true);
  };

  const handleDateClick = (info: any) => {
    const clickedDate = info.dateStr;

    setSelectedDate(clickedDate);

    openCreateModal(clickedDate);
  };

  /* =========================================================
     EVENT CLICK
     ========================================================= */

  const handleEventClick = (info: any) => {
    const id = String(info.event.id);

    const event = events.find(
      (item) => String(item.id) === id
    );

    if (event) {
      setSelectedEvent(event);
    }
  };

  /* =========================================================
     CREATE ACTIVITY
     ========================================================= */

  const handleCreate = async () => {
    if (!form.title.trim()) {
      alert("Please enter activity title.");
      return;
    }

    if (!form.date) {
      alert("Please select activity date.");
      return;
    }

    if (!form.person) {
      alert("Please select responsible faculty.");
      return;
    }

    try {
      const created = await eventsApi.create({
        title: form.title,
        date: form.date,
        type: form.type,
        person: form.person,
        description: form.description,
        location: form.location,
      });

      setEvents((previous) => [...previous, created]);

      setShowCreate(false);
      setForm(emptyForm);

      alert("Activity created successfully.");
    } catch (err: any) {
      alert(
        "Failed to create activity: " +
          (err?.message || "Unknown error")
      );
    }
  };

  /* =========================================================
     DELETE ACTIVITY
     ========================================================= */

  const handleDelete = async () => {
    if (!selectedEvent) return;

    if (!isHodOrAdmin) {
      alert(
        "Only HOD / Administrator can delete department activities."
      );
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedEvent.title}"?\n\nThis action cannot be undone.`
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeleting(true);

      await eventsApi.delete(selectedEvent.id);

      setEvents((previous) =>
        previous.filter(
          (event) =>
            String(event.id) !==
            String(selectedEvent.id)
        )
      );

      setSelectedEvent(null);

      alert("Activity deleted successfully.");
    } catch (err: any) {
      alert(
        "Failed to delete activity: " +
          (err?.message || "Unknown error")
      );
    } finally {
      setDeleting(false);
    }
  };

  /* =========================================================
     CALENDAR EVENTS
     ========================================================= */

  const calendarEvents = events.map((event) => ({
    id: String(event.id),
    title: event.title,
    start: event.date,

    classNames: [
      "hiera-calendar-event",
      typeClass[
        (event.type as ActivityType) || "Academic"
      ],
    ],

    extendedProps: {
      type: event.type,
      person: event.person,
      description: event.description,
      location: event.location,
    },
  }));

  /* =========================================================
     STATISTICS
     ========================================================= */

  const totalEvents = events.length;

  const academicCount = events.filter(
    (e) => e.type === "Academic"
  ).length;

  const meetingCount = events.filter(
    (e) => e.type === "Meeting"
  ).length;

  const workshopCount = events.filter(
    (e) => e.type === "Workshop"
  ).length;

  const researchCount = events.filter(
    (e) => e.type === "Research"
  ).length;

  /* =========================================================
     UPCOMING EVENTS
     ========================================================= */

  const upcomingEvents = [...events]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  /* =========================================================
     DATE FORMAT
     ========================================================= */

  const formatDate = (date?: string) => {
    if (!date) return "-";

    return new Date(
      `${date}T00:00:00`
    ).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  /* =========================================================
     UI
     ========================================================= */

  return (
    <div className="calendar-page">

      {/* =====================================================
          HEADER
      ===================================================== */}

      <div className="calendar-header">

        <div className="calendar-heading">

          <div className="calendar-main-icon">
            <span>▦</span>
            <i />
          </div>

          <div className="calendar-title-area">

            <div className="department-label">
              SBJIT NAGPUR • CSE AIML DEPARTMENT
            </div>

            <h1>Academic Workflow Calendar</h1>

            <p>
              Plan, assign, review and manage department
              activities from one intelligent academic calendar.
            </p>

          </div>
        </div>

        <div className="header-actions">

          <div className="role-badge">
            <span className="online-dot" />

            {isHodOrAdmin
              ? "Department Admin"
              : "Faculty Member"}
          </div>

          {isHodOrAdmin && (
            <button
              className="primary-btn"
              onClick={() => openCreateModal()}
            >
              <span>＋</span>
              Create Activity
            </button>
          )}

        </div>
      </div>

      {/* =====================================================
          ERROR
      ===================================================== */}

      {error && (
        <div className="calendar-error">

          <div>
            <strong>Calendar Error</strong>
            <span>{error}</span>
          </div>

          <button onClick={loadCalendar}>
            Retry
          </button>

        </div>
      )}

      {/* =====================================================
          STATS
      ===================================================== */}

      <div className="calendar-stats">

        <div className="stat-card">
          <div className="stat-icon pink">
            ▦
          </div>

          <div className="stat-info">
            <span>Total Activities</span>
            <strong>{totalEvents}</strong>
            <small>Department schedule</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            📚
          </div>

          <div className="stat-info">
            <span>Academic</span>
            <strong>{academicCount}</strong>
            <small>Academic activities</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">
            👥
          </div>

          <div className="stat-info">
            <span>Meetings</span>
            <strong>{meetingCount}</strong>
            <small>Department meetings</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            🎓
          </div>

          <div className="stat-info">
            <span>Workshops</span>
            <strong>{workshopCount}</strong>
            <small>Learning activities</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon teal">
            🔬
          </div>

          <div className="stat-info">
            <span>Research</span>
            <strong>{researchCount}</strong>
            <small>Research activities</small>
          </div>
        </div>

      </div>

      {/* =====================================================
          MAIN LAYOUT
      ===================================================== */}

      <div className="calendar-layout">

        {/* ===================================================
            CALENDAR
        =================================================== */}

        <section className="calendar-card">

          <div className="section-header">

            <div className="section-heading">

              <div className="section-kicker">
                DEPARTMENT SCHEDULE
              </div>

              <h2>Department Calendar</h2>

              <p>
                Click a date to create an activity or click
                an event to view details.
              </p>

            </div>

            <div className="legend">

              <span>
                <i className="dot blue-dot" />
                Academic
              </span>

              <span>
                <i className="dot purple-dot" />
                Meeting
              </span>

              <span>
                <i className="dot orange-dot" />
                Workshop
              </span>

              <span>
                <i className="dot teal-dot" />
                Department
              </span>

              <span>
                <i className="dot pink-dot" />
                Research
              </span>

            </div>

          </div>

          <div className="calendar-wrapper">

            {loading ? (
              <div className="calendar-loading">

                <div className="loader" />

                <span>
                  Loading department calendar...
                </span>

              </div>
            ) : (
              <FullCalendar
                plugins={[
                  dayGridPlugin,
                  timeGridPlugin,
                  interactionPlugin,
                ]}
                initialView="dayGridMonth"
                height="680px"
                events={calendarEvents}
                dateClick={handleDateClick}
                eventClick={handleEventClick}

                dayCellClassNames={(info) => {
                  const date = info.date
                    .toISOString()
                    .split("T")[0];

                  return date === selectedDate
                    ? ["fc-day-selected"]
                    : [];
                }}

                dayMaxEvents={3}
                eventDisplay="block"
                fixedWeekCount={false}
                showNonCurrentDates={true}

                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right:
                    "dayGridMonth,timeGridWeek,timeGridDay",
                }}

                buttonText={{
                  today: "Today",
                  month: "Month",
                  week: "Week",
                  day: "Day",
                }}
              />
            )}

          </div>

        </section>

        {/* ===================================================
            SIDEBAR
        =================================================== */}

        <aside className="calendar-sidebar">

          {/* ROLE CARD */}

          <div className="role-card">

            <div className="role-card-icon">
              🛡
            </div>

            <small>
              Your Calendar Role
            </small>

            <h3>
              {isHodOrAdmin
                ? "Department Admin"
                : "Faculty Member"}
            </h3>

            <div className="role-permission">

              <span>✓</span>

              {isHodOrAdmin
                ? "You can create and manage department activities."
                : "You can view activities assigned to you."}

            </div>

          </div>

          {/* UPCOMING */}

          <div className="upcoming-card">

            <div className="upcoming-heading">

              <div>

                <div className="section-kicker">
                  NEXT ACTIVITIES
                </div>

                <h2>Upcoming</h2>

              </div>

              <span className="count-badge">
                {upcomingEvents.length}
              </span>

            </div>

            {upcomingEvents.length === 0 ? (

              <div className="empty-upcoming">

                <div>📅</div>

                <span>
                  No upcoming activities.
                </span>

              </div>

            ) : (

              <div className="upcoming-list">

                {upcomingEvents.map((event) => {

                  const type =
                    (event.type as ActivityType) ||
                    "Academic";

                  return (
                    <button
                      className="upcoming-item"
                      key={event.id}
                      onClick={() =>
                        setSelectedEvent(event)
                      }
                    >

                      <div
                        className={`upcoming-icon ${
                          typeClass[type]
                        }`}
                      >
                        {typeIcons[type]}
                      </div>

                      <div className="upcoming-content">

                        <small>
                          {type}
                        </small>

                        <strong>
                          {event.title}
                        </strong>

                        <span>
                          📅 {formatDate(event.date)}
                        </span>

                        <span>
                          👤 {event.person}
                        </span>

                      </div>

                      <span className="upcoming-arrow">
                        →
                      </span>

                    </button>
                  );
                })}

              </div>
            )}

          </div>

          {/* AI */}

          <div className="ai-card">

            <div className="ai-top">

              <div className="ai-icon">
                ✦
              </div>

              <div>

                <div className="section-kicker">
                  HIERASYNC AI
                </div>

                <h3>
                  Smart Academic Planning
                </h3>

              </div>

            </div>

            <p>
              {aiMessage}
            </p>

            <div className="ai-status">

              <span />

              AI Calendar Assistant Active

            </div>

          </div>

        </aside>

      </div>

      {/* =====================================================
          CREATE MODAL
      ===================================================== */}

      {showCreate && (

        <div
          className="modal-overlay"
          onMouseDown={() =>
            setShowCreate(false)
          }
        >

          <div
            className="activity-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >

            <div className="modal-header">

              <div>

                <div className="section-kicker">
                  DEPARTMENT SCHEDULE
                </div>

                <h2>
                  Create Activity
                </h2>

                <p>
                  Add a new academic workflow activity.
                </p>

              </div>

              <button
                className="close-btn"
                onClick={() =>
                  setShowCreate(false)
                }
              >
                ×
              </button>

            </div>

            <div className="form-grid">

              <label>
                Activity Title *

                <input
                  value={form.title}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      title: e.target.value,
                    })
                  }
                  placeholder="e.g. Final Year Project Review"
                />
              </label>

              <label>
                Activity Date *

                <input
                  type="date"
                  value={form.date}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      date: e.target.value,
                    })
                  }
                />
              </label>

              <label>
                Activity Type *

                <select
                  value={form.type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      type:
                        e.target.value as ActivityType,
                    })
                  }
                >
                  <option>Academic</option>
                  <option>Meeting</option>
                  <option>Workshop</option>
                  <option>
                    Department Activity
                  </option>
                  <option>Research</option>
                </select>

              </label>

              <label>
                Responsible Faculty *

                <select
                  value={form.person}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      person: e.target.value,
                    })
                  }
                >

                  <option value="">
                    Select responsible faculty
                  </option>

                  {facultyList.map((faculty) => (
                    <option
                      key={faculty.id}
                      value={faculty.name}
                    >
                      {faculty.name}
                    </option>
                  ))}

                </select>

              </label>

              <label className="full-field">

                Location

                <input
                  value={form.location}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      location: e.target.value,
                    })
                  }
                  placeholder="e.g. AI Lab / Seminar Hall"
                />

              </label>

              <label className="full-field">

                Description

                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the activity..."
                />

              </label>

            </div>

            <div className="modal-footer">

              <button
                className="secondary-btn"
                onClick={() =>
                  setShowCreate(false)
                }
              >
                Cancel
              </button>

              <button
                className="primary-btn"
                onClick={handleCreate}
              >
                ✓ Create Activity
              </button>

            </div>

          </div>

        </div>

      )}

      {/* =====================================================
          EVENT DETAILS + DELETE
      ===================================================== */}

      {selectedEvent && (

        <div
          className="modal-overlay"
          onMouseDown={() =>
            !deleting && setSelectedEvent(null)
          }
        >

          <div
            className="details-modal"
            onMouseDown={(e) =>
              e.stopPropagation()
            }
          >

            {/* DETAILS BANNER */}

            <div
              className={`details-banner ${
                typeClass[
                  (selectedEvent.type as ActivityType) ||
                    "Academic"
                ]
              }`}
            >

              <span>
                {
                  typeIcons[
                    (selectedEvent.type as ActivityType) ||
                      "Academic"
                  ]
                }
              </span>

              <button
                className="close-btn"
                disabled={deleting}
                onClick={() =>
                  setSelectedEvent(null)
                }
              >
                ×
              </button>

            </div>

            {/* DETAILS BODY */}

            <div className="details-body">

              <span className="activity-type">
                {selectedEvent.type || "Academic"}
              </span>

              <h2>
                {selectedEvent.title}
              </h2>

              <div className="detail-row">

                <span>📅</span>

                <div>

                  <small>
                    Date
                  </small>

                  <strong>
                    {formatDate(
                      selectedEvent.date
                    )}
                  </strong>

                </div>

              </div>

              <div className="detail-row">

                <span>👤</span>

                <div>

                  <small>
                    Responsible Faculty
                  </small>

                  <strong>
                    {selectedEvent.person}
                  </strong>

                </div>

              </div>

              {selectedEvent.location && (

                <div className="detail-row">

                  <span>📍</span>

                  <div>

                    <small>
                      Location
                    </small>

                    <strong>
                      {selectedEvent.location}
                    </strong>

                  </div>

                </div>

              )}

              {selectedEvent.description && (

                <div className="description-box">

                  <small>
                    Description
                  </small>

                  <p>
                    {selectedEvent.description}
                  </p>

                </div>

              )}

              <div className="status-flow">

                <span className="active">
                  Planned
                </span>

                <i>→</i>

                <span>
                  Assigned
                </span>

                <i>→</i>

                <span>
                  Review
                </span>

                <i>→</i>

                <span>
                  Completed
                </span>

              </div>

              {/* DELETE BUTTON */}

              {isHodOrAdmin && (

                <div className="delete-section">

                  <button
                    className="delete-task-btn"
                    disabled={deleting}
                    onClick={handleDelete}
                  >

                    {deleting ? (
                      <>
                        <span className="delete-spinner" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        🗑
                        Delete Activity
                      </>
                    )}

                  </button>

                </div>

              )}

            </div>

          </div>

        </div>

      )}

    </div>
  );
}