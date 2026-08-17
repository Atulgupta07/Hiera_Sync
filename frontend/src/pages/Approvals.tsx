import { useEffect, useMemo, useState } from "react";
import { eventsApi, aiApi, employeesApi } from "../api";
import { EventResponse, EmployeeResponse } from "../types";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import "./CalendarPage.css";

type UserRole = "ADMIN" | "HOD" | "EMPLOYEE";

type WorkflowStatus =
  | "Planned"
  | "Assigned"
  | "In Progress"
  | "Review"
  | "Completed";

type ActivityType =
  | "Academic"
  | "Meeting"
  | "Workshop"
  | "Department Activity"
  | "Research";

interface CalendarEventData extends EventResponse {
  status?: WorkflowStatus;
  priority?: "Low" | "Medium" | "High";
  startTime?: string;
  endTime?: string;
  description?: string;
  assignedTo?: string;
  assignedBy?: string;
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEventData[]>([]);
  const [facultyList, setFacultyList] = useState<EmployeeResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [selectedEvent, setSelectedEvent] =
    useState<CalendarEventData | null>(null);

  const [selectedDate, setSelectedDate] = useState("");

  const [aiInsights, setAiInsights] = useState(
    "AI is analyzing your academic calendar and upcoming department activities."
  );

  /*
   * TEMPORARY ROLE
   *
   * Change this according to your actual logged-in user.
   *
   * ADMIN
   * HOD
   * EMPLOYEE
   */
  const userRole: UserRole = "HOD";

  const isAdmin = userRole === "ADMIN";
  const isHOD = userRole === "HOD";
  const isFaculty = userRole === "EMPLOYEE";

  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    type: "Academic" as ActivityType,
    person: "",
    startTime: "10:00",
    endTime: "11:00",
    priority: "Medium" as "Low" | "Medium" | "High",
    description: "",
  });

  /* ---------------- FETCH DATA ---------------- */

  useEffect(() => {
    const loadCalendar = async () => {
      try {
        setLoading(true);

        const [eventsData, facultyData] = await Promise.all([
          eventsApi.getAll(),
          employeesApi.getAll(),
        ]);

        setEvents(eventsData as CalendarEventData[]);
        setFacultyList(facultyData);

        try {
          const insights = await aiApi.getCalendarInsights();

          if (insights?.message) {
            setAiInsights(insights.message);
          }
        } catch {
          // AI is optional
        }
      } catch (err: any) {
        setError(err?.message || "Failed to load calendar");
      } finally {
        setLoading(false);
      }
    };

    loadCalendar();
  }, []);

  /* ---------------- STATISTICS ---------------- */

  const statistics = useMemo(() => {
    return {
      total: events.length,
      academic: events.filter((e) => e.type === "Academic").length,
      meetings: events.filter((e) => e.type === "Meeting").length,
      workshops: events.filter((e) => e.type === "Workshop").length,
      research: events.filter((e) => e.type === "Research").length,
      pending: events.filter(
        (e) =>
          e.status === "Planned" ||
          e.status === "Assigned" ||
          !e.status
      ).length,
    };
  }, [events]);

  /* ---------------- CALENDAR EVENTS ---------------- */

  const calendarEvents = events.map((event) => ({
    id: String(event.id),
    title: event.title,
    start: event.date,
    allDay: true,

    extendedProps: {
      type: event.type,
      person: event.person,
      status: event.status || "Assigned",
      priority: event.priority || "Medium",
      description: event.description || "",
    },
  }));

  /* ---------------- CREATE EVENT ---------------- */

  const handleCreateEvent = async () => {
    if (
      !newEvent.title ||
      !newEvent.date ||
      !newEvent.person
    ) {
      alert("Please fill all required fields.");
      return;
    }

    try {
      const created = await eventsApi.create({
        title: newEvent.title,
        date: newEvent.date,
        type: newEvent.type,
        person: newEvent.person,
      });

      const enhancedEvent: CalendarEventData = {
        ...(created as CalendarEventData),
        status: "Assigned",
        priority: newEvent.priority,
        startTime: newEvent.startTime,
        endTime: newEvent.endTime,
        description: newEvent.description,
      };

      setEvents((previous) => [...previous, enhancedEvent]);

      setShowForm(false);

      setNewEvent({
        title: "",
        date: "",
        type: "Academic",
        person: "",
        startTime: "10:00",
        endTime: "11:00",
        priority: "Medium",
        description: "",
      });
    } catch (err: any) {
      alert(
        "Failed to create activity: " +
          (err?.message || "Unknown error")
      );
    }
  };

  /* ---------------- DATE CLICK ---------------- */

  const handleDateClick = (info: any) => {
    setSelectedDate(info.dateStr);

    /*
     * Admin/HOD can create activity by clicking date.
     */
    if (isAdmin || isHOD) {
      setNewEvent((previous) => ({
        ...previous,
        date: info.dateStr,
      }));

      setShowForm(true);
    }
  };

  /* ---------------- EVENT CLICK ---------------- */

  const handleEventClick = (info: any) => {
    const clickedEvent = events.find(
      (event) => String(event.id) === String(info.event.id)
    );

    if (clickedEvent) {
      setSelectedEvent(clickedEvent);
      setShowDetails(true);
    }
  };

  /* ---------------- WORKFLOW ACTION ---------------- */

  const handleStatusChange = (
    newStatus: WorkflowStatus
  ) => {
    if (!selectedEvent) return;

    setEvents((previous) =>
      previous.map((event) =>
        event.id === selectedEvent.id
          ? {
              ...event,
              status: newStatus,
            }
          : event
      )
    );

    setSelectedEvent({
      ...selectedEvent,
      status: newStatus,
    });
  };

  /* ---------------- UPCOMING EVENTS ---------------- */

  const upcomingEvents = [...events]
    .sort(
      (a, b) =>
        new Date(a.date).getTime() -
        new Date(b.date).getTime()
    )
    .slice(0, 5);

  /* ---------------- TYPE ICON ---------------- */

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "Academic":
        return "📚";
      case "Meeting":
        return "👥";
      case "Workshop":
        return "🎓";
      case "Research":
        return "🔬";
      case "Department Activity":
        return "🏫";
      default:
        return "📅";
    }
  };

  /* ---------------- ROLE LABEL ---------------- */

  const roleLabel = isAdmin
    ? "Administrator"
    : isHOD
    ? "Head of Department"
    : "Faculty Member";

  return (
    <div className="calendar-page">

      {/* =====================================================
          HEADER
      ====================================================== */}

      <section className="calendar-header">

        <div>
          <div className="calendar-eyebrow">
            🏫 SBJIT NAGPUR • CSE AIML DEPARTMENT
          </div>

          <h1>Academic Workflow Calendar</h1>

          <p>
            Plan, assign, review and manage department
            activities from one intelligent academic calendar.
          </p>
        </div>

        <div className="header-actions">

          <div className="role-badge">
            <span>●</span>
            {roleLabel}
          </div>

          {(isAdmin || isHOD) && (
            <button
              className="create-event-button"
              onClick={() => {
                setSelectedDate("");
                setShowForm(true);
              }}
            >
              <span>＋</span>
              Create Activity
            </button>
          )}
        </div>
      </section>

      {/* =====================================================
          ERROR
      ====================================================== */}

      {error && (
        <div className="calendar-error">
          ⚠️ {error}
        </div>
      )}

      {/* =====================================================
          STATISTICS
      ====================================================== */}

      <section className="stats-grid">

        <div className="stat-card total-card">
          <div className="stat-icon">📅</div>
          <div>
            <span>Total Activities</span>
            <strong>{statistics.total}</strong>
          </div>
        </div>

        <div className="stat-card academic-card">
          <div className="stat-icon">📚</div>
          <div>
            <span>Academic</span>
            <strong>{statistics.academic}</strong>
          </div>
        </div>

        <div className="stat-card meeting-card">
          <div className="stat-icon">👥</div>
          <div>
            <span>Meetings</span>
            <strong>{statistics.meetings}</strong>
          </div>
        </div>

        <div className="stat-card workshop-card">
          <div className="stat-icon">🎓</div>
          <div>
            <span>Workshops</span>
            <strong>{statistics.workshops}</strong>
          </div>
        </div>

        <div className="stat-card pending-card">
          <div className="stat-icon">⏳</div>
          <div>
            <span>Pending</span>
            <strong>{statistics.pending}</strong>
          </div>
        </div>

      </section>

      {/* =====================================================
          MAIN CALENDAR
      ====================================================== */}

      {loading ? (
        <div className="calendar-loading">
          <div className="loading-spinner"></div>
          <p>Loading academic calendar...</p>
        </div>
      ) : (
        <section className="calendar-panel">

          <div className="calendar-panel-header">

            <div>
              <h2>Department Calendar</h2>

              <p>
                {isFaculty
                  ? "View your assigned academic activities."
                  : "Click a date to create an activity • Click an event to view details"}
              </p>
            </div>

            <div className="calendar-legend">

              <span>
                <i className="legend-dot academic-dot"></i>
                Academic
              </span>

              <span>
                <i className="legend-dot meeting-dot"></i>
                Meeting
              </span>

              <span>
                <i className="legend-dot workshop-dot"></i>
                Workshop
              </span>

              <span>
                <i className="legend-dot research-dot"></i>
                Research
              </span>

            </div>

          </div>

          <div className="calendar-wrapper">

            <FullCalendar
              plugins={[
                dayGridPlugin,
                timeGridPlugin,
                interactionPlugin,
              ]}
              initialView="dayGridMonth"
              events={calendarEvents}
              height="auto"
              dayMaxEvents={3}
              editable={false}
              selectable={isAdmin || isHOD}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
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

          </div>

        </section>
      )}

      {/* =====================================================
          WORKFLOW
      ====================================================== */}

      <section className="workflow-section">

        <div className="section-heading">
          <div>
            <span className="section-label">
              HIERASYNC WORKFLOW
            </span>

            <h2>Academic Activity Lifecycle</h2>

            <p>
              Every department activity follows a clear
              responsibility and approval flow.
            </p>
          </div>
        </div>

        <div className="workflow">

          <div className="workflow-step">
            <div className="workflow-number">01</div>
            <div className="workflow-icon">👤</div>
            <h3>Plan</h3>
            <p>HOD / Admin creates activity</p>
          </div>

          <div className="workflow-line"></div>

          <div className="workflow-step">
            <div className="workflow-number">02</div>
            <div className="workflow-icon">📋</div>
            <h3>Assign</h3>
            <p>Activity assigned to faculty</p>
          </div>

          <div className="workflow-line"></div>

          <div className="workflow-step">
            <div className="workflow-number">03</div>
            <div className="workflow-icon">👨‍🏫</div>
            <h3>Execute</h3>
            <p>Faculty works on activity</p>
          </div>

          <div className="workflow-line"></div>

          <div className="workflow-step">
            <div className="workflow-number">04</div>
            <div className="workflow-icon">🔍</div>
            <h3>Review</h3>
            <p>HOD reviews completion</p>
          </div>

          <div className="workflow-line"></div>

          <div className="workflow-step completed-step">
            <div className="workflow-number">05</div>
            <div className="workflow-icon">✓</div>
            <h3>Completed</h3>
            <p>Activity successfully closed</p>
          </div>

        </div>

      </section>

      {/* =====================================================
          UPCOMING ACTIVITIES
      ====================================================== */}

      <section className="upcoming-section">

        <div className="section-heading">
          <div>
            <span className="section-label">
              DEPARTMENT SCHEDULE
            </span>

            <h2>Upcoming Activities</h2>

            <p>
              Important academic events and responsibilities.
            </p>
          </div>

          <span className="event-count">
            {upcomingEvents.length} Events
          </span>
        </div>

        <div className="upcoming-grid">

          {upcomingEvents.length === 0 ? (
            <div className="empty-events">
              📅 No upcoming activities.
            </div>
          ) : (
            upcomingEvents.map((event, index) => (

              <div
                className={`upcoming-card type-${event.type
                  ?.toLowerCase()
                  .replaceAll(" ", "-")}`}
                key={event.id || index}
                onClick={() => {
                  setSelectedEvent(event);
                  setShowDetails(true);
                }}
              >

                <div className="upcoming-top">

                  <span className="event-type">
                    {getTypeIcon(event.type)}
                    {event.type}
                  </span>

                  <span
                    className={`status-pill ${
                      event.status
                        ? event.status
                            .toLowerCase()
                            .replaceAll(" ", "-")
                        : "assigned"
                    }`}
                  >
                    {event.status || "Assigned"}
                  </span>

                </div>

                <h3>{event.title}</h3>

                <div className="event-info">
                  <span>
                    📅{" "}
                    {new Date(event.date).toLocaleDateString(
                      "en-IN",
                      {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }
                    )}
                  </span>

                  <span>
                    👨‍🏫 {event.person}
                  </span>
                </div>

                <button className="view-details">
                  View Details →
                </button>

              </div>

            ))
          )}

        </div>

      </section>

      {/* =====================================================
          AI ASSISTANT
      ====================================================== */}

      <section className="ai-calendar-card">

        <div className="ai-icon">🤖</div>

        <div className="ai-content">

          <div className="ai-title-row">
            <h2>HieraSync AI Calendar Assistant</h2>

            <span className="ai-active">
              ● AI Active
            </span>
          </div>

          <h3>Smart Academic Planning</h3>

          <p>{aiInsights}</p>

        </div>

        <button className="ai-button">
          View AI Insights →
        </button>

      </section>

      {/* =====================================================
          CREATE ACTIVITY MODAL
      ====================================================== */}

      {showForm && (isAdmin || isHOD) && (

        <div
          className="modal-overlay"
          onClick={() => setShowForm(false)}
        >

          <div
            className="event-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="modal-header">

              <div>
                <span className="modal-label">
                  ACADEMIC WORKFLOW
                </span>

                <h2>Create Department Activity</h2>

                <p>
                  Add a new academic workflow activity.
                </p>
              </div>

              <button
                className="close-modal"
                onClick={() => setShowForm(false)}
              >
                ×
              </button>

            </div>

            <div className="form-grid">

              <div className="form-field full-width">

                <label>Activity Title *</label>

                <input
                  value={newEvent.title}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      title: e.target.value,
                    })
                  }
                  placeholder="e.g. Final Year Project Review"
                />

              </div>

              <div className="form-field">

                <label>Activity Date *</label>

                <input
                  type="date"
                  value={newEvent.date}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      date: e.target.value,
                    })
                  }
                />

              </div>

              <div className="form-field">

                <label>Activity Type *</label>

                <select
                  value={newEvent.type}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      type: e.target.value as ActivityType,
                    })
                  }
                >
                  <option>Academic</option>
                  <option>Meeting</option>
                  <option>Workshop</option>
                  <option>Department Activity</option>
                  <option>Research</option>
                </select>

              </div>

              <div className="form-field">

                <label>Start Time</label>

                <input
                  type="time"
                  value={newEvent.startTime}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      startTime: e.target.value,
                    })
                  }
                />

              </div>

              <div className="form-field">

                <label>End Time</label>

                <input
                  type="time"
                  value={newEvent.endTime}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      endTime: e.target.value,
                    })
                  }
                />

              </div>

              <div className="form-field">

                <label>Priority</label>

                <select
                  value={newEvent.priority}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      priority: e.target.value as
                        | "Low"
                        | "Medium"
                        | "High",
                    })
                  }
                >
                  <option>Low</option>
                  <option>Medium</option>
                  <option>High</option>
                </select>

              </div>

              <div className="form-field">

                <label>Responsible Faculty *</label>

                <select
                  value={newEvent.person}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
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

              </div>

              <div className="form-field full-width">

                <label>Description</label>

                <textarea
                  rows={4}
                  value={newEvent.description}
                  onChange={(e) =>
                    setNewEvent({
                      ...newEvent,
                      description: e.target.value,
                    })
                  }
                  placeholder="Describe the academic activity..."
                />

              </div>

            </div>

            <div className="modal-actions">

              <button
                className="cancel-button"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </button>

              <button
                className="save-event-button"
                onClick={handleCreateEvent}
              >
                ✓ Create Activity
              </button>

            </div>

          </div>

        </div>
      )}

      {/* =====================================================
          EVENT DETAILS MODAL
      ====================================================== */}

      {showDetails && selectedEvent && (

        <div
          className="modal-overlay"
          onClick={() => setShowDetails(false)}
        >

          <div
            className="details-modal"
            onClick={(e) => e.stopPropagation()}
          >

            <div className="details-header">

              <div
                className={`details-icon type-${selectedEvent.type
                  ?.toLowerCase()
                  .replaceAll(" ", "-")}`}
              >
                {getTypeIcon(selectedEvent.type)}
              </div>

              <div>

                <span className="modal-label">
                  {selectedEvent.type}
                </span>

                <h2>{selectedEvent.title}</h2>

              </div>

              <button
                className="close-modal"
                onClick={() => setShowDetails(false)}
              >
                ×
              </button>

            </div>

            <div className="details-date">
              📅{" "}
              {new Date(
                selectedEvent.date
              ).toLocaleDateString("en-IN", {
                weekday: "long",
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </div>

            <div className="details-grid">

              <div>
                <span>Responsible Faculty</span>
                <strong>
                  👨‍🏫 {selectedEvent.person}
                </strong>
              </div>

              <div>
                <span>Priority</span>
                <strong>
                  ⚡ {selectedEvent.priority || "Medium"}
                </strong>
              </div>

              <div>
                <span>Time</span>
                <strong>
                  🕐{" "}
                  {selectedEvent.startTime || "10:00"} –
                  {selectedEvent.endTime || "11:00"}
                </strong>
              </div>

              <div>
                <span>Status</span>
                <strong>
                  ● {selectedEvent.status || "Assigned"}
                </strong>
              </div>

            </div>

            {selectedEvent.description && (
              <div className="description-box">
                <span>Description</span>
                <p>{selectedEvent.description}</p>
              </div>
            )}

            {/* ROLE BASED ACTIONS */}

            {isFaculty && (
              <div className="faculty-actions">

                <p>
                  This activity has been assigned to you.
                  Update the status as you progress.
                </p>

                <button
                  onClick={() =>
                    handleStatusChange("In Progress")
                  }
                >
                  ▶ Start Activity
                </button>

                <button
                  onClick={() =>
                    handleStatusChange("Completed")
                  }
                >
                  ✓ Mark Completed
                </button>

              </div>
            )}

            {isHOD && (
              <div className="hod-actions">

                <span className="action-heading">
                  HOD Workflow Actions
                </span>

                <div>

                  <button
                    onClick={() =>
                      handleStatusChange("In Progress")
                    }
                  >
                    ▶ Mark In Progress
                  </button>

                  <button
                    onClick={() =>
                      handleStatusChange("Review")
                    }
                  >
                    🔍 Send for Review
                  </button>

                  <button
                    onClick={() =>
                      handleStatusChange("Completed")
                    }
                  >
                    ✓ Complete
                  </button>

                </div>

              </div>
            )}

            {isAdmin && (
              <div className="admin-actions">

                <span className="action-heading">
                  Administrator Controls
                </span>

                <div>

                  <button
                    onClick={() =>
                      handleStatusChange("Completed")
                    }
                  >
                    ✓ Mark Completed
                  </button>

                  <button
                    onClick={() =>
                      alert(
                        "Edit functionality can be connected to the backend here."
                      )
                    }
                  >
                    ✎ Edit Activity
                  </button>

                </div>

              </div>
            )}

          </div>

        </div>
      )}

    </div>
  );
}