import { useEffect, useMemo, useState, useRef } from "react";
import { eventsApi, employeesApi, aiApi, institutionalCalendarApi } from "../api";
import {
  EventResponse,
  EmployeeResponse,
  InstitutionalEventItem,
  InstitutionalCalendarHistoryItem
} from "../types";

import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

import { useAuth } from "../contexts/AuthContext";

import "./CalendarPage.css";

type ActivityType =
  | "Academic"
  | "Meeting"
  | "Workshop"
  | "Department Activity"
  | "Research"
  | "Teaching & Learning"
  | "Examination"
  | "Internal Assessment"
  | "Seminar"
  | "Holiday"
  | "Faculty Development"
  | "Student Activity"
  | "Academic Deadline"
  | "Events";

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

const typeIcons: Record<string, string> = {
  Academic: "📚",
  Meeting: "👥",
  Workshop: "🎓",
  "Department Activity": "🏫",
  Research: "🔬",
  "Teaching & Learning": "📖",
  Examination: "📝",
  "Internal Assessment": "📊",
  Seminar: "🎙️",
  Holiday: "🌴",
  "Faculty Development": "💡",
  "Student Activity": "🏆",
  "Academic Deadline": "⏰",
  Events: "📅",
};

const typeClass: Record<string, string> = {
  Academic: "academic",
  Meeting: "meeting",
  Workshop: "workshop",
  "Department Activity": "department",
  Research: "research",
  "Teaching & Learning": "academic",
  Examination: "examination",
  "Internal Assessment": "assessment",
  Seminar: "meeting",
  Holiday: "holiday",
  "Faculty Development": "fdp",
  "Student Activity": "student",
  "Academic Deadline": "deadline",
  Events: "academic",
};

const ALL_CATEGORIES = [
  "Teaching & Learning",
  "Examination",
  "Internal Assessment",
  "Workshop",
  "Seminar",
  "Meeting",
  "Holiday",
  "Faculty Development",
  "Student Activity",
  "Academic Deadline",
  "Events",
  "Academic",
  "Research",
  "Department Activity"
];

export default function CalendarPage() {
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [facultyList, setFacultyList] = useState<EmployeeResponse[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventResponse | null>(null);

  const [selectedDate, setSelectedDate] = useState("");
  const [deleting, setDeleting] = useState(false);

  const [, setAiMessage] = useState(
    "Your academic schedule is organized. I can help identify upcoming deadlines and overloaded days."
  );

  const [form, setForm] = useState<FormState>(emptyForm);

  // SEARCH & FILTER
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("All");

  // UPLOAD INSTITUTIONAL CALENDAR STATES
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadAcademicYear, setUploadAcademicYear] = useState("2026-2027");
  const [uploadSemester, setUploadSemester] = useState("Odd Semester");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // AI EXTRACTION PREVIEW STATES
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [draftId, setDraftId] = useState("");
  const [draftFilename, setDraftFilename] = useState("");
  const [draftEvents, setDraftEvents] = useState<InstitutionalEventItem[]>([]);
  const [publishing, setPublishing] = useState(false);

  // CALENDAR VERSION HISTORY
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyList, setHistoryList] = useState<InstitutionalCalendarHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // EDIT OFFICIAL EVENT (HOD MODIFICATION)
  const [isEditingEvent, setIsEditingEvent] = useState(false);
  const [editEventForm, setEditEventForm] = useState({
    title: "",
    date: "",
    start_date: "",
    end_date: "",
    category: "",
    description: "",
    location: ""
  });
  const [savingEdit, setSavingEdit] = useState(false);

  // CALENDAR AI ASSISTANT WIDGET
  const [aiQuestion, setAiQuestion] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { user } = useAuth();

  const userRole = useMemo(() => {
    if (user?.role) {
      return String(user.role).toUpperCase();
    }
    const storedRole =
      localStorage.getItem("role") ||
      localStorage.getItem("userRole") ||
      localStorage.getItem("user_role");

    if (storedRole) return storedRole.toUpperCase();

    return "FACULTY";
  }, [user]);

  const isHodOrAdmin =
    userRole.includes("ADMIN") ||
    userRole.includes("HOD") ||
    userRole.includes("HEAD");

  const displayRole = isHodOrAdmin ? "Department Admin" : "Faculty";

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

  const openCreateModal = (date = "") => {
    if (!isHodOrAdmin) {
      alert("Only HOD / Administrator can create department activities.");
      return;
    }

    setSelectedDate(date);

    setForm({
      ...emptyForm,
      date,
    });

    setShowCreate(true);
  };

  const handleDateClick = (info: any) => {
    openCreateModal(info.dateStr);
  };

  /* =========================================================
     EVENT CLICK
  ========================================================= */

  const handleEventClick = (info: any) => {
    const id = String(info.event.id);

    const event = events.find((item) => String(item.id) === id);

    if (event) {
      setSelectedEvent(event);
      setIsEditingEvent(false);
      setEditEventForm({
        title: event.title || "",
        date: event.date || event.start_date || "",
        start_date: event.start_date || event.date || "",
        end_date: event.end_date || event.start_date || event.date || "",
        category: event.category || event.type || "Teaching & Learning",
        description: event.description || "",
        location: event.location || ""
      });
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
        title: form.title.trim(),
        date: form.date,
        type: form.type,
        person: form.person,
        description: form.description.trim(),
        location: form.location.trim(),
      });

      setEvents((previous) => [...previous, created]);

      setShowCreate(false);
      setForm(emptyForm);

      alert("Activity created successfully.");
    } catch (err: any) {
      alert("Failed to create activity: " + (err?.message || "Unknown error"));
    }
  };

  /* =========================================================
     DELETE ACTIVITY
  ========================================================= */

  const handleDelete = async () => {
    if (!selectedEvent) return;

    if (!isHodOrAdmin) {
      alert("Only HOD / Administrator can delete activities.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete "${selectedEvent.title}"?\n\nThis action will be logged in the Calendar Version History.`
    );

    if (!confirmed) return;

    try {
      setDeleting(true);

      if (selectedEvent.is_institutional) {
        await institutionalCalendarApi.deleteEvent(selectedEvent.id);
      } else {
        await eventsApi.delete(selectedEvent.id);
      }

      setEvents((previous) =>
        previous.filter((event) => String(event.id) !== String(selectedEvent.id))
      );

      setSelectedEvent(null);
      alert("Activity deleted successfully.");
    } catch (err: any) {
      alert("Failed to delete activity: " + (err?.message || "Unknown error"));
    } finally {
      setDeleting(false);
    }
  };

  /* =========================================================
     HOD EDIT OFFICIAL INSTITUTIONAL EVENT
  ========================================================= */

  const handleSaveEventEdit = async () => {
    if (!selectedEvent) return;
    if (!editEventForm.title.trim()) {
      alert("Activity title cannot be empty.");
      return;
    }
    if (!editEventForm.start_date) {
      alert("Activity date cannot be empty.");
      return;
    }

    try {
      setSavingEdit(true);
      const updated = await institutionalCalendarApi.updateEvent(selectedEvent.id, {
        title: editEventForm.title.trim(),
        date: editEventForm.start_date,
        start_date: editEventForm.start_date,
        end_date: editEventForm.end_date || editEventForm.start_date,
        category: editEventForm.category,
        type: editEventForm.category,
        location: editEventForm.location.trim(),
        description: editEventForm.description.trim()
      });

      // Update in local events state
      setEvents((prev) =>
        prev.map((e) => (String(e.id) === String(selectedEvent.id) ? { ...e, ...updated } : e))
      );
      setSelectedEvent(updated);
      setIsEditingEvent(false);
      alert("Official activity updated successfully. Change logged in Version History.");
    } catch (err: any) {
      alert("Failed to update activity: " + (err?.message || "Unknown error"));
    } finally {
      setSavingEdit(false);
    }
  };

  /* =========================================================
     UPLOAD INSTITUTIONAL CALENDAR WORKFLOW
  ========================================================= */

  const handleFileUpload = async () => {
    if (!uploadFile) {
      setUploadError("Please select a document file (PDF, DOCX, or XLSX/XLS).");
      return;
    }

    try {
      setUploading(true);
      setUploadError("");

      const response = await institutionalCalendarApi.upload(
        uploadFile,
        uploadAcademicYear,
        uploadSemester
      );

      setDraftId(response.draft_id);
      setDraftFilename(response.filename);
      setDraftEvents(response.events);

      setShowUploadModal(false);
      setUploadFile(null);
      setShowPreviewModal(true);
    } catch (err: any) {
      setUploadError(err?.message || "Failed to process uploaded calendar document.");
    } finally {
      setUploading(false);
    }
  };

  /* =========================================================
     AI PREVIEW ACTIONS
  ========================================================= */

  const handleUpdateDraftItem = (index: number, field: keyof InstitutionalEventItem, value: string) => {
    setDraftEvents((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === "start_date" && !updated[index].end_date) {
        updated[index].end_date = value;
      }
      if (field === "start_date" && !updated[index].date) {
        updated[index].date = value;
      }
      return updated;
    });
  };

  const handleDeleteDraftItem = (index: number) => {
    setDraftEvents((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleAddDraftItem = () => {
    const todayStr = new Date().toISOString().split("T")[0];
    const newItem: InstitutionalEventItem = {
      id: `draft_new_${Date.now()}`,
      title: "New Institutional Activity",
      date: todayStr,
      start_date: todayStr,
      end_date: todayStr,
      category: "Teaching & Learning",
      description: "Official institutional activity.",
      location: "Campus"
    };
    setDraftEvents((prev) => [...prev, newItem]);
  };

  const handlePublishCalendar = async () => {
    if (draftEvents.length === 0) {
      alert("Cannot publish an empty calendar. Please add at least one activity.");
      return;
    }

    try {
      setPublishing(true);
      await institutionalCalendarApi.publish(draftId, {
        academic_year: uploadAcademicYear,
        semester: uploadSemester,
        events: draftEvents
      });

      setShowPreviewModal(false);
      alert(`Official Institutional Academic Calendar approved and published!\n\nFaculty members will now automatically see the ${draftEvents.length} official activities.`);
      await loadCalendar();
    } catch (err: any) {
      alert("Failed to publish calendar: " + (err?.message || "Unknown error"));
    } finally {
      setPublishing(false);
    }
  };

  /* =========================================================
     CALENDAR VERSION HISTORY
  ========================================================= */

  const openHistoryModal = async () => {
    try {
      setLoadingHistory(true);
      setShowHistoryModal(true);
      const history = await institutionalCalendarApi.getHistory();
      setHistoryList(history);
    } catch (err: any) {
      alert("Failed to load calendar history: " + (err?.message || "Unknown error"));
    } finally {
      setLoadingHistory(false);
    }
  };

  /* =========================================================
     AI CALENDAR ASSISTANT QUERY
  ========================================================= */

  const handleAskAI = async (presetQuestion?: string) => {
    const questionToAsk = (presetQuestion || aiQuestion).trim();
    if (!questionToAsk || aiLoading) return;

    if (!presetQuestion) setAiQuestion("");
    setAiLoading(true);
    setAiResponse("Consulting official institutional calendar database...");

    try {
      const res = await institutionalCalendarApi.askAI(questionToAsk);
      setAiResponse(res.answer);
    } catch (err: any) {
      setAiResponse(`⚠️ ${err?.message || "Unable to retrieve calendar information at this time."}`);
    } finally {
      setAiLoading(false);
    }
  };

  /* =========================================================
     FILTERED EVENTS & CALENDAR MAPPING
  ========================================================= */

  const filteredEvents = useMemo(() => {
    return events.filter((evt) => {
      const cat = (evt.category || evt.type || "").toLowerCase();
      if (selectedCategory !== "All" && cat !== selectedCategory.toLowerCase()) {
        return false;
      }
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const title = (evt.title || "").toLowerCase();
        const desc = (evt.description || "").toLowerCase();
        const person = (evt.person || "").toLowerCase();
        const location = (evt.location || "").toLowerCase();
        if (
          !title.includes(term) &&
          !desc.includes(term) &&
          !person.includes(term) &&
          !location.includes(term) &&
          !cat.includes(term)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [events, selectedCategory, searchTerm]);

  const calendarEvents = filteredEvents.map((event) => {
    const type = event.category || event.type || "Academic";

    return {
      id: String(event.id),
      title: event.title,
      start: event.start_date || event.date,
      end:
        event.end_date && event.end_date !== (event.start_date || event.date)
          ? event.end_date
          : undefined,

      classNames: [
        "hiera-calendar-event",
        typeClass[type] || "academic",
        event.is_institutional ? "institutional-event-node" : "",
      ],

      extendedProps: {
        type: event.type || event.category,
        category: event.category || event.type,
        person: event.person,
        description: event.description,
        location: event.location,
        is_institutional: event.is_institutional,
        academic_year: event.academic_year,
        semester: event.semester,
      },
    };
  });

  /* =========================================================
     STATISTICS
  ========================================================= */

  const totalEvents = events.length;
  const academicCount = events.filter((e) => (e.category || e.type) === "Academic" || (e.category || e.type) === "Teaching & Learning").length;
  const meetingCount = events.filter((e) => (e.category || e.type) === "Meeting" || (e.category || e.type) === "Seminar").length;
  const workshopCount = events.filter((e) => (e.category || e.type) === "Workshop").length;
  const researchCount = events.filter((e) => (e.category || e.type) === "Research" || (e.category || e.type) === "Faculty Development").length;

  /* =========================================================
     UPCOMING EVENTS
  ========================================================= */

  const upcomingEvents = [...filteredEvents]
    .sort((a, b) => ((a.start_date || a.date) || "").localeCompare((b.start_date || b.date) || ""))
    .slice(0, 6);

  /* =========================================================
     DATE FORMAT
  ========================================================= */

  const formatDate = (date?: string) => {
    if (!date) return "-";
    try {
      const cleanDate = date.includes("T") ? date.split("T")[0] : date;
      return new Date(`${cleanDate}T00:00:00`).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });
    } catch {
      return date;
    }
  };

  const closeCreateModal = () => {
    setShowCreate(false);
    setForm(emptyForm);
    setSelectedDate("");
  };

  /* =========================================================
     UI RENDER
  ========================================================= */

  return (
    <div className="calendar-page">

      {/* HEADER */}
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
              Plan, assign, review and manage department activities from one intelligent academic calendar.
            </p>
          </div>
        </div>

        {/* HEADER ACTIONS: [Department Admin] [Upload Academic Calendar] [+ Create Activity] */}
        <div className="header-actions">
          <div className="role-badge">
            <span className="online-dot" />
            {displayRole}
          </div>

          {isHodOrAdmin && (
            <>
              {/* PRIMARY REQUIRED BUTTON: Upload Academic Calendar */}
              <button
                className="primary-btn upload-calendar-btn"
                onClick={() => {
                  setUploadError("");
                  setUploadFile(null);
                  setShowUploadModal(true);
                }}
                title="Upload official institutional calendar (PDF, DOCX, XLSX) for AI extraction"
              >
                <span>📤</span>
                Upload Academic Calendar
              </button>

              {/* EXISTING BUTTON: + Create Activity */}
              <button
                className="primary-btn"
                onClick={() => openCreateModal()}
              >
                <span>＋</span>
                Create Activity
              </button>

              {/* CALENDAR VERSION HISTORY */}
              <button
                className="secondary-btn history-btn"
                onClick={openHistoryModal}
                title="View Calendar Version History & Audit Trail"
              >
                <span>🕒</span>
                Version History
              </button>
            </>
          )}
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div className="calendar-error">
          <div>
            <strong>Calendar Error</strong>
            <span>{error}</span>
          </div>
          <button onClick={loadCalendar}>Retry</button>
        </div>
      )}

      {/* STATS */}
      <div className="calendar-stats">
        <div className="stat-card">
          <div className="stat-icon pink">▦</div>
          <div className="stat-info">
            <span>Total Activities</span>
            <strong>{totalEvents}</strong>
            <small>Department schedule</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">📚</div>
          <div className="stat-info">
            <span>Academic</span>
            <strong>{academicCount}</strong>
            <small>Academic & Instruction</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon purple">👥</div>
          <div className="stat-info">
            <span>Meetings</span>
            <strong>{meetingCount}</strong>
            <small>Meetings & Seminars</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">🎓</div>
          <div className="stat-info">
            <span>Workshops</span>
            <strong>{workshopCount}</strong>
            <small>Learning & Hands-on</small>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon teal">🔬</div>
          <div className="stat-info">
            <span>Faculty Dev</span>
            <strong>{researchCount}</strong>
            <small>FDP & Research</small>
          </div>
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="calendar-layout">

        {/* CALENDAR SECTION */}
        <section className="calendar-card">
          <div className="section-header">
            <div className="section-heading">
              <div className="section-kicker">DEPARTMENT SCHEDULE</div>
              <h2>Department Calendar</h2>
              <p>
                {isHodOrAdmin
                  ? "Click a date to create an activity, upload official semester calendar, or click an event to view/edit details."
                  : "View official academic activities, examinations, deadlines, and schedule assigned to you."}
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
                Research/FDP
              </span>
            </div>
          </div>

          {/* SEARCH & CATEGORY FILTER BAR */}
          <div className="calendar-filter-bar">
            <input
              type="text"
              className="filter-search-input"
              placeholder="🔍 Search activities by title, description, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select
              className="filter-category-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
            >
              <option value="All">All Categories ({events.length})</option>
              <option value="Teaching & Learning">Teaching & Learning</option>
              <option value="Examination">Examination</option>
              <option value="Internal Assessment">Internal Assessment</option>
              <option value="Workshop">Workshop</option>
              <option value="Seminar">Seminar</option>
              <option value="Meeting">Meeting</option>
              <option value="Holiday">Holiday</option>
              <option value="Faculty Development">Faculty Development</option>
              <option value="Student Activity">Student Activity</option>
              <option value="Academic Deadline">Academic Deadline</option>
              <option value="Academic">Academic</option>
              <option value="Research">Research</option>
            </select>
          </div>

          <div className="calendar-wrapper">
            {loading ? (
              <div className="calendar-loading">
                <div className="loader" />
                <span>Loading department calendar...</span>
              </div>
            ) : (
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                initialView="dayGridMonth"
                height="680px"
                events={calendarEvents}
                dateClick={handleDateClick}
                eventClick={handleEventClick}
                dayCellClassNames={(info) => {
                  const date = info.date.toISOString().split("T")[0];
                  return date === selectedDate ? ["fc-day-selected"] : [];
                }}
                dayMaxEvents={3}
                eventDisplay="block"
                fixedWeekCount={false}
                showNonCurrentDates={true}
                headerToolbar={{
                  left: "prev,next today",
                  center: "title",
                  right: "dayGridMonth,timeGridWeek,timeGridDay",
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

        {/* SIDEBAR */}
        <aside className="calendar-sidebar">
          {/* ROLE CARD */}
          <div className="role-card">
            <div className="role-card-icon">🛡</div>
            <small>Your Calendar Role</small>
            <h3>{displayRole}</h3>
            <div className="role-permission">
              <span>✓</span>
              {isHodOrAdmin
                ? "You can upload institutional calendars, create activities, and modify official dates."
                : "You can view approved institutional calendar activities and manage your permitted department schedule."}
            </div>
          </div>

          {/* UPCOMING ACTIVITIES */}
          <div className="upcoming-card">
            <div className="upcoming-heading">
              <div>
                <div className="section-kicker">NEXT ACTIVITIES</div>
                <h2>Upcoming</h2>
              </div>
              <span className="count-badge">{upcomingEvents.length}</span>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="empty-upcoming">
                <div>📅</div>
                <span>No upcoming activities found.</span>
              </div>
            ) : (
              <div className="upcoming-list">
                {upcomingEvents.map((event) => {
                  const type = event.category || event.type || "Academic";

                  return (
                    <button
                      className="upcoming-item"
                      key={event.id}
                      onClick={() => {
                        setSelectedEvent(event);
                        setIsEditingEvent(false);
                      }}
                    >
                      <div className={`upcoming-icon ${typeClass[type] || "academic"}`}>
                        {typeIcons[type] || "📚"}
                      </div>

                      <div className="upcoming-content">
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <small>{type}</small>
                          {event.is_institutional && (
                            <span style={{ fontSize: "9px", color: "#d83a78", fontWeight: 800 }}>
                              • Official
                            </span>
                          )}
                        </div>

                        <strong>{event.title}</strong>
                        <span>📅 {formatDate(event.start_date || event.date)}</span>
                        <span>👤 {event.person || "Department"}</span>
                      </div>

                      <span className="upcoming-arrow">→</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* AI CALENDAR ASSISTANT INTERACTIVE WIDGET */}
          <div className="ai-card">
            <div className="ai-top">
              <div className="ai-icon">✦</div>
              <div>
                <small style={{ color: "#d83a78", fontWeight: 800, letterSpacing: "0.5px" }}>
                  AI CALENDAR ASSISTANT
                </small>
                <h3>Institutional AI</h3>
              </div>
            </div>

            <p>
              Ask questions directly answered from the approved institutional academic calendar database.
            </p>

            <div className="calendar-ai-widget">
              <div className="ai-chip-list">
                <button className="ai-chip" onClick={() => handleAskAI("What activities are scheduled this week?")}>
                  This Week
                </button>
                <button className="ai-chip" onClick={() => handleAskAI("When is the next internal assessment?")}>
                  Assessments
                </button>
                <button className="ai-chip" onClick={() => handleAskAI("Show upcoming academic deadlines")}>
                  Deadlines
                </button>
                <button className="ai-chip" onClick={() => handleAskAI("List faculty development activities")}>
                  FDP
                </button>
              </div>

              <div className="calendar-ai-input-row">
                <input
                  className="calendar-ai-input"
                  placeholder="Ask schedule or exam question..."
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAskAI()}
                />
                <button
                  className="calendar-ai-btn"
                  onClick={() => handleAskAI()}
                  disabled={aiLoading}
                >
                  {aiLoading ? "..." : "Ask"}
                </button>
              </div>

              {aiResponse && (
                <div className="ai-response-box">
                  <div style={{ whiteSpace: "pre-line" }}>{aiResponse}</div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* =========================================================
         1. UPLOAD ACADEMIC CALENDAR MODAL (HOD ONLY)
      ========================================================= */}
      {showUploadModal && (
        <div className="modal-overlay" onMouseDown={() => !uploading && setShowUploadModal(false)}>
          <div className="activity-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">INSTITUTIONAL CALENDAR IMPORT</div>
                <h2>Upload Academic Calendar</h2>
                <p>
                  Upload official institutional calendar (PDF, DOCX, XLSX/XLS). System AI will read the document, extract date-wise activities, and present an extraction preview for your verification.
                </p>
              </div>

              <button
                className="close-btn"
                disabled={uploading}
                onClick={() => setShowUploadModal(false)}
              >
                ×
              </button>
            </div>

            {uploadError && (
              <div style={{ margin: "14px 22px", padding: "10px 14px", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "10px", color: "#dc2626", fontSize: "12px" }}>
                ⚠️ {uploadError}
              </div>
            )}

            <div className="form-grid">
              <label>
                Academic Year
                <input
                  value={uploadAcademicYear}
                  onChange={(e) => setUploadAcademicYear(e.target.value)}
                  placeholder="e.g. 2026-2027"
                  disabled={uploading}
                />
              </label>

              <label>
                Semester
                <select
                  value={uploadSemester}
                  onChange={(e) => setUploadSemester(e.target.value)}
                  disabled={uploading}
                >
                  <option value="Odd Semester">Odd Semester (Sem I, III, V, VII)</option>
                  <option value="Even Semester">Even Semester (Sem II, IV, VI, VIII)</option>
                  <option value="Annual">Annual Academic Session</option>
                </select>
              </label>
            </div>

            {/* DROPZONE */}
            <div
              className="upload-dropzone"
              onClick={() => !uploading && fileInputRef.current?.click()}
            >
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                accept=".pdf,.docx,.doc,.xlsx,.xls,.txt"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadFile(e.target.files[0]);
                    setUploadError("");
                  }
                }}
              />
              <div className="upload-dropzone-icon">📄</div>
              {uploadFile ? (
                <div>
                  <strong style={{ color: "#17213d", fontSize: "14px" }}>{uploadFile.name}</strong>
                  <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: "12px" }}>
                    {(uploadFile.size / 1024).toFixed(1)} KB • Click to choose a different file
                  </p>
                </div>
              ) : (
                <div>
                  <strong style={{ color: "#17213d", fontSize: "14px" }}>
                    Click to select or drag & drop Academic Calendar file
                  </strong>
                  <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: "12px" }}>
                    Supported formats: PDF, DOCX, XLSX, XLS
                  </p>
                </div>
              )}
            </div>

            {uploading && (
              <div style={{ textAlign: "center", padding: "16px 22px", background: "#fdf2f8", margin: "0 22px 16px", borderRadius: "12px", border: "1px solid #fbcfe8" }}>
                <div className="loader" style={{ margin: "0 auto 10px" }} />
                <strong style={{ color: "#be185d", fontSize: "13px" }}>
                  AI Calendar Assistant is analyzing document & extracting date-wise activities...
                </strong>
                <p style={{ margin: "4px 0 0", color: "#831843", fontSize: "11px" }}>
                  Identifying dates, events, institutional activities, exams, holidays, and categories.
                </p>
              </div>
            )}

            <div className="modal-footer">
              <button
                className="secondary-btn"
                disabled={uploading}
                onClick={() => setShowUploadModal(false)}
              >
                Cancel
              </button>

              <button
                className="primary-btn upload-calendar-btn"
                disabled={uploading || !uploadFile}
                onClick={handleFileUpload}
              >
                {uploading ? "Analyzing with AI..." : "Extract with AI Assistant →"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
         2. AI EXTRACTION PREVIEW & VERIFICATION MODAL
      ========================================================= */}
      {showPreviewModal && (
        <div className="modal-overlay" onMouseDown={() => !publishing && setShowPreviewModal(false)}>
          <div className="activity-modal preview-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">STEP 6-7: VERIFICATION REQUIRED</div>
                <h2>AI Extraction Preview & Verification</h2>
                <p>
                  AI extracted <strong>{draftEvents.length} activities</strong> from <em>{draftFilename}</em>. Please review, edit dates or categories, add missing entries, or delete mistakes before approving.
                </p>
              </div>

              <button
                className="close-btn"
                disabled={publishing}
                onClick={() => setShowPreviewModal(false)}
              >
                ×
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 22px", background: "#f8fafc", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ fontSize: "12px", color: "#475569" }}>
                Status: <span style={{ color: "#d97706", fontWeight: 700 }}>Unverified Draft (Not Yet Published)</span>
              </div>
              <button
                className="secondary-btn"
                onClick={handleAddDraftItem}
                disabled={publishing}
              >
                ＋ Add Missing Entry
              </button>
            </div>

            {/* PREVIEW TABLE */}
            <div className="preview-table-container">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th style={{ width: "135px" }}>Date (YYYY-MM-DD)</th>
                    <th style={{ width: "135px" }}>End Date</th>
                    <th>Activity / Event Name</th>
                    <th style={{ width: "190px" }}>Category</th>
                    <th>Description</th>
                    <th style={{ width: "50px", textAlign: "center" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {draftEvents.map((item, idx) => (
                    <tr key={item.id || idx}>
                      <td>
                        <input
                          type="date"
                          className="preview-input"
                          value={item.start_date}
                          onChange={(e) => handleUpdateDraftItem(idx, "start_date", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="date"
                          className="preview-input"
                          value={item.end_date || item.start_date}
                          onChange={(e) => handleUpdateDraftItem(idx, "end_date", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          className="preview-input"
                          value={item.title}
                          placeholder="Activity name"
                          onChange={(e) => handleUpdateDraftItem(idx, "title", e.target.value)}
                        />
                      </td>
                      <td>
                        <select
                          className="preview-select"
                          value={item.category}
                          onChange={(e) => handleUpdateDraftItem(idx, "category", e.target.value)}
                        >
                          {ALL_CATEGORIES.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="preview-input"
                          value={item.description || ""}
                          placeholder="Description / notes"
                          onChange={(e) => handleUpdateDraftItem(idx, "description", e.target.value)}
                        />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        <button
                          className="delete-row-btn"
                          title="Delete activity"
                          onClick={() => handleDeleteDraftItem(idx)}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                  {draftEvents.length === 0 && (
                    <tr>
                      <td colSpan={6} style={{ textAlign: "center", padding: "30px", color: "#94a3b8" }}>
                        No activities in draft. Click "+ Add Missing Entry" to add an entry manually.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="modal-footer">
              <button
                className="secondary-btn"
                disabled={publishing}
                onClick={() => setShowPreviewModal(false)}
              >
                Cancel / Discard
              </button>

              <button
                className="primary-btn upload-calendar-btn"
                disabled={publishing || draftEvents.length === 0}
                onClick={handlePublishCalendar}
              >
                {publishing ? "Publishing Official Calendar..." : "✓ Approve & Publish Official Calendar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
         3. CALENDAR VERSION HISTORY MODAL (HOD ONLY)
      ========================================================= */}
      {showHistoryModal && (
        <div className="modal-overlay" onMouseDown={() => setShowHistoryModal(false)}>
          <div className="activity-modal preview-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">AUDIT TRAIL & LOGS</div>
                <h2>Calendar Version History</h2>
                <p>
                  Complete changelog and revision history for all published institutional calendar activities.
                </p>
              </div>

              <button className="close-btn" onClick={() => setShowHistoryModal(false)}>
                ×
              </button>
            </div>

            <div className="history-table-container">
              {loadingHistory ? (
                <div style={{ padding: "40px", textAlign: "center" }}>
                  <div className="loader" style={{ margin: "0 auto 10px" }} />
                  <span>Loading version history...</span>
                </div>
              ) : historyList.length === 0 ? (
                <div style={{ padding: "40px", textAlign: "center", color: "#94a3b8" }}>
                  No historical modifications recorded yet. Changes made to official calendar entries will appear here.
                </div>
              ) : (
                <table className="preview-table">
                  <thead>
                    <tr>
                      <th>Modified On</th>
                      <th>Modified By</th>
                      <th>Activity / Event</th>
                      <th>Action</th>
                      <th>Field Changed</th>
                      <th>Previous Value</th>
                      <th>Updated Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historyList.map((hist) => (
                      <tr key={hist.id}>
                        <td style={{ whiteSpace: "nowrap", color: "#64748b", fontSize: "11px" }}>
                          {hist.modified_at ? new Date(hist.modified_at).toLocaleString("en-IN") : "-"}
                        </td>
                        <td>
                          <strong>{hist.modified_by}</strong>
                          <div style={{ fontSize: "10px", color: "#94a3b8" }}>{hist.modified_by_role || "HOD"}</div>
                        </td>
                        <td>
                          <strong>{hist.event_title}</strong>
                        </td>
                        <td>
                          <span
                            className={
                              hist.action_type === "PUBLISH"
                                ? "history-badge-publish"
                                : hist.action_type === "DELETE"
                                ? "history-badge-delete"
                                : "history-badge-update"
                            }
                          >
                            {hist.action_type}
                          </span>
                        </td>
                        <td style={{ color: "#475569" }}>{hist.field_changed || "all"}</td>
                        <td style={{ color: "#dc2626", maxWidth: "200px", wordBreak: "break-word" }}>
                          {hist.previous_value || "-"}
                        </td>
                        <td style={{ color: "#16a34a", maxWidth: "200px", wordBreak: "break-word" }}>
                          {hist.updated_value || "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="modal-footer">
              <button className="secondary-btn" onClick={() => setShowHistoryModal(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
         4. CREATE ACTIVITY MODAL (EXISTING PRESERVED)
      ========================================================= */}
      {showCreate && (
        <div className="modal-overlay" onMouseDown={closeCreateModal}>
          <div className="activity-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="section-kicker">DEPARTMENT SCHEDULE</div>
                <h2>Create Activity</h2>
                <p>Add a new academic workflow activity.</p>
              </div>

              <button className="close-btn" onClick={closeCreateModal}>
                ×
              </button>
            </div>

            <div className="form-grid">
              <label>
                Activity Title *
                <input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Final Year Project Review"
                />
              </label>

              <label>
                Activity Date *
                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                />
              </label>

              <label>
                Activity Type *
                <select
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value as ActivityType })}
                >
                  {ALL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Responsible Faculty *
                <select
                  value={form.person}
                  onChange={(e) => setForm({ ...form, person: e.target.value })}
                >
                  <option value="">Select responsible faculty</option>
                  {facultyList.map((faculty) => (
                    <option key={faculty.id} value={faculty.name}>
                      {faculty.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="full-field">
                Location
                <input
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="e.g. AI Lab / Seminar Hall"
                />
              </label>

              <label className="full-field">
                Description
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Describe the activity..."
                />
              </label>
            </div>

            <div className="modal-footer">
              <button className="secondary-btn" onClick={closeCreateModal}>
                Cancel
              </button>

              <button className="primary-btn" onClick={handleCreate}>
                ✓ Create Activity
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================
         5. EVENT DETAILS MODAL (ENHANCED WITH INSTITUTIONAL SUPPORT)
      ========================================================= */}
      {selectedEvent && (
        <div className="modal-overlay" onMouseDown={() => !deleting && setSelectedEvent(null)}>
          <div className="details-modal" onMouseDown={(e) => e.stopPropagation()}>
            <div
              className={`details-banner ${
                typeClass[selectedEvent.category || selectedEvent.type || "Academic"] || "academic"
              }`}
            >
              <span>
                {typeIcons[selectedEvent.category || selectedEvent.type || "Academic"] || "📚"}
              </span>

              <button
                className="close-btn"
                disabled={deleting}
                onClick={() => setSelectedEvent(null)}
              >
                ×
              </button>
            </div>

            <div className="details-body">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <span className="activity-type">
                  {selectedEvent.category || selectedEvent.type || "Academic"}
                </span>

                {selectedEvent.is_institutional && (
                  <span className="institutional-badge">
                    🏛️ Official Institutional Activity
                  </span>
                )}
              </div>

              {/* READ OR EDIT FORM */}
              {isEditingEvent ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 11, marginTop: 10 }}>
                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                    Activity Title *
                    <input
                      className="preview-input"
                      style={{ marginTop: 4 }}
                      value={editEventForm.title}
                      onChange={(e) => setEditEventForm({ ...editEventForm, title: e.target.value })}
                    />
                  </label>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                      Start Date *
                      <input
                        type="date"
                        className="preview-input"
                        style={{ marginTop: 4 }}
                        value={editEventForm.start_date}
                        onChange={(e) => setEditEventForm({ ...editEventForm, start_date: e.target.value })}
                      />
                    </label>

                    <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                      End Date
                      <input
                        type="date"
                        className="preview-input"
                        style={{ marginTop: 4 }}
                        value={editEventForm.end_date}
                        onChange={(e) => setEditEventForm({ ...editEventForm, end_date: e.target.value })}
                      />
                    </label>
                  </div>

                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                    Category *
                    <select
                      className="preview-select"
                      style={{ marginTop: 4 }}
                      value={editEventForm.category}
                      onChange={(e) => setEditEventForm({ ...editEventForm, category: e.target.value })}
                    >
                      {ALL_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                    Location
                    <input
                      className="preview-input"
                      style={{ marginTop: 4 }}
                      value={editEventForm.location}
                      onChange={(e) => setEditEventForm({ ...editEventForm, location: e.target.value })}
                    />
                  </label>

                  <label style={{ fontSize: "11px", fontWeight: 800, color: "#475569" }}>
                    Description
                    <textarea
                      rows={3}
                      className="preview-input"
                      style={{ marginTop: 4 }}
                      value={editEventForm.description}
                      onChange={(e) => setEditEventForm({ ...editEventForm, description: e.target.value })}
                    />
                  </label>

                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}>
                    <button
                      className="secondary-btn"
                      disabled={savingEdit}
                      onClick={() => setIsEditingEvent(false)}
                    >
                      Cancel
                    </button>
                    <button
                      className="primary-btn"
                      disabled={savingEdit}
                      onClick={handleSaveEventEdit}
                    >
                      {savingEdit ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <h2>{selectedEvent.title}</h2>

                  <div className="detail-row">
                    <span>📅</span>
                    <div>
                      <small>Date</small>
                      <strong>
                        {formatDate(selectedEvent.start_date || selectedEvent.date)}
                        {selectedEvent.end_date &&
                          selectedEvent.end_date !== (selectedEvent.start_date || selectedEvent.date) &&
                          ` – ${formatDate(selectedEvent.end_date)}`}
                      </strong>
                    </div>
                  </div>

                  <div className="detail-row">
                    <span>👤</span>
                    <div>
                      <small>Responsible</small>
                      <strong>{selectedEvent.person || "Institutional / Department"}</strong>
                    </div>
                  </div>

                  {selectedEvent.location && (
                    <div className="detail-row">
                      <span>📍</span>
                      <div>
                        <small>Location</small>
                        <strong>{selectedEvent.location}</strong>
                      </div>
                    </div>
                  )}

                  {selectedEvent.description && (
                    <div className="description-box">
                      <small>Description</small>
                      <p>{selectedEvent.description}</p>
                    </div>
                  )}

                  <div className="status-flow">
                    <span className="active">Planned</span>
                    <i>→</i>
                    <span>Assigned</span>
                    <i>→</i>
                    <span>Review</span>
                    <i>→</i>
                    <span>Completed</span>
                  </div>

                  {/* HOD / ADMIN ACTIONS */}
                  {isHodOrAdmin ? (
                    <div className="delete-section" style={{ display: "flex", gap: 10, justifyContent: "space-between" }}>
                      <button
                        className="secondary-btn"
                        onClick={() => setIsEditingEvent(true)}
                      >
                        ✏️ Edit Activity
                      </button>

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
                          <>🗑 Delete Activity</>
                        )}
                      </button>
                    </div>
                  ) : (
                    selectedEvent.is_institutional && (
                      <div style={{ marginTop: 15, padding: "9px 12px", background: "#f8fafc", borderRadius: "9px", border: "1px solid #e2e8f0", fontSize: "11px", color: "#64748b" }}>
                        ℹ️ Official institutional calendar activity (Read-only for faculty members).
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}