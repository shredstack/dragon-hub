/**
 * The classroom roster as a printable PDF.
 *
 * Server-only, and deliberately the *only* thing in the app that imports
 * `@react-pdf/renderer` — it pulls in a font engine and a layout engine, and
 * neither belongs in a browser bundle. Everything about *what* goes on the page
 * is decided in `classroom-roster-document.ts`, which is client-safe; this file
 * decides only how it looks.
 *
 * **One `<Page>` per room, and rooms flow onto more pages as they need them.**
 * A DLI grade's mailing covers a Red room and a Blue room, and they travel as
 * one file with a page each rather than as two attachments a board member has
 * to remember to attach both of.
 *
 * The disclaimer is `fixed` to the bottom of every page for the same reason it
 * is written into the CSV: this file gets forwarded, printed and pinned up, and
 * what it does and doesn't contain has to be readable wherever it lands.
 */

import "server-only";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type {
  RosterDocument,
  RosterPerson,
  RosterRoom,
  RosterSection,
} from "@/lib/classroom-roster-document";

// The app's own palette, from `globals.css`. Hard-coded rather than read from a
// CSS variable because a PDF has no stylesheet to read one out of.
const BLUE = "#1e3a8a";
const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const BAND = "#f8fafc";

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingHorizontal: 44,
    // Room for the fixed footer, which sits outside the flow.
    paddingBottom: 68,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: INK,
  },

  schoolLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  roomName: { fontSize: 22, fontFamily: "Helvetica-Bold", color: BLUE, marginTop: 6 },
  roomMeta: { fontSize: 10, color: MUTED, marginTop: 3 },
  headerRule: { borderBottomWidth: 2, borderBottomColor: BLUE, marginTop: 10 },

  teacherBlock: { marginTop: 14, marginBottom: 4 },
  teacherLabel: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  teacherRow: { flexDirection: "row", marginTop: 4 },
  teacherName: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  teacherEmail: { fontSize: 10, color: MUTED, marginTop: 1 },

  section: { marginTop: 18 },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: BLUE,
    paddingBottom: 4,
  },
  sectionTitle: { fontSize: 13, fontFamily: "Helvetica-Bold", color: BLUE },
  coverage: { fontSize: 9, color: MUTED },
  summary: { fontSize: 9, color: MUTED, marginTop: 5 },

  tableHead: {
    flexDirection: "row",
    marginTop: 8,
    paddingBottom: 3,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  th: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  waitingRow: { backgroundColor: BAND },
  colName: { width: "38%", paddingRight: 8 },
  colEmail: { width: "40%", paddingRight: 8 },
  colPhone: { width: "22%" },
  name: { fontSize: 10, fontFamily: "Helvetica-Bold" },
  detail: { fontSize: 8, color: MUTED, marginTop: 1 },
  students: { fontSize: 8, color: INK, marginTop: 1, fontFamily: "Helvetica-Oblique" },
  cell: { fontSize: 9, color: INK },

  openSeat: { fontSize: 9, color: MUTED, marginTop: 6, fontFamily: "Helvetica-Oblique" },
  empty: { fontSize: 9, color: MUTED, marginTop: 8, fontFamily: "Helvetica-Oblique" },

  footer: {
    position: "absolute",
    bottom: 26,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: MUTED, lineHeight: 1.4 },
  footerMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
    fontSize: 7.5,
    color: MUTED,
  },
});

function PersonRow({ person }: { person: RosterPerson }) {
  return (
    <View style={person.waitlisted ? [styles.row, styles.waitingRow] : styles.row} wrap={false}>
      <View style={styles.colName}>
        <Text style={styles.name}>{person.name}</Text>
        {person.detail ? <Text style={styles.detail}>{person.detail}</Text> : null}
        {/* Board-only, and blank for everyone else — the withholding happened in
            `personCells`, not here. Printed under the parent's name because
            "whose grown-up is this" is the question it answers. */}
        {person.students ? (
          <Text style={styles.students}>{person.students}</Text>
        ) : null}
      </View>
      <View style={styles.colEmail}>
        <Text style={styles.cell}>{person.email}</Text>
      </View>
      <View style={styles.colPhone}>
        {/* A blank phone is normal, not a gap to explain: it is withheld for a
            teacher of record, and plenty of parents never entered one. */}
        <Text style={styles.cell}>{person.phone || "—"}</Text>
      </View>
    </View>
  );
}

function Section({ section }: { section: RosterSection }) {
  const hasPeople = section.people.length > 0;
  return (
    <View style={styles.section} break={false}>
      {/* The heading stays with at least the first row rather than stranding
          itself at the foot of a page. */}
      <View wrap={false}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.coverage ? <Text style={styles.coverage}>{section.coverage}</Text> : null}
        </View>
        {section.summary ? <Text style={styles.summary}>{section.summary}</Text> : null}
        {hasPeople ? (
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.colName]}>Name</Text>
            <Text style={[styles.th, styles.colEmail]}>Email</Text>
            <Text style={[styles.th, styles.colPhone]}>Phone</Text>
          </View>
        ) : null}
        {hasPeople ? <PersonRow person={section.people[0]} /> : null}
      </View>

      {section.people.slice(1).map((person) => (
        <PersonRow key={`${person.email}-${person.detail}`} person={person} />
      ))}

      {!hasPeople ? <Text style={styles.empty}>{section.emptyMessage}</Text> : null}
      {section.openSeats > 0 ? (
        <Text style={styles.openSeat}>
          {section.openSeats} {section.openSeats === 1 ? "spot is" : "spots are"} still
          open.
        </Text>
      ) : null}
    </View>
  );
}

function RoomPage({ doc, room }: { doc: RosterDocument; room: RosterRoom }) {
  return (
    <Page size="LETTER" style={styles.page}>
      <View>
        <View style={styles.schoolLine}>
          <Text>{doc.schoolName}</Text>
          <Text>{doc.schoolYear}</Text>
        </View>
        <Text style={styles.roomName}>{room.classroomName}</Text>
        <Text style={styles.roomMeta}>
          {[
            room.gradeLevel,
            `${room.peopleCount} ${room.peopleCount === 1 ? "volunteer" : "volunteers"}`,
          ]
            .filter(Boolean)
            .join("   •   ")}
        </Text>
        <View style={styles.headerRule} />
      </View>

      {room.teachers.length > 0 ? (
        <View style={styles.teacherBlock}>
          <Text style={styles.teacherLabel}>
            {room.teachers.length === 1 ? "Teacher" : "Teachers"}
          </Text>
          {room.teachers.map((teacher) => (
            <View key={teacher.email} style={styles.teacherRow}>
              <View>
                <Text style={styles.teacherName}>{teacher.name}</Text>
                <Text style={styles.teacherEmail}>{teacher.email}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {room.sections.map((section) => (
        <Section key={section.id} section={section} />
      ))}

      <View style={styles.footer} fixed>
        <Text style={styles.footerText}>{doc.disclaimer}</Text>
        <Text style={styles.footerText}>{doc.footerNote}</Text>
        <View style={styles.footerMeta}>
          <Text>Exported {doc.exportedOn}</Text>
          <Text
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </View>
    </Page>
  );
}

function RosterPdf({ doc }: { doc: RosterDocument }) {
  return (
    <Document title={doc.title} author={doc.schoolName} subject="Classroom roster">
      {doc.rooms.map((room) => (
        <RoomPage key={room.classroomId} doc={doc} room={room} />
      ))}
    </Document>
  );
}

/**
 * Render a roster document to PDF bytes.
 *
 * Returns base64 rather than a Buffer because it crosses a server action
 * boundary to reach the browser, which is how every other export in the app
 * travels — the client turns it back into a Blob and downloads it, the same
 * path `downloadCsv` takes. A route handler would stream the file directly, but
 * a plain navigation to one is exactly what the native shell's WebView handles
 * least well.
 */
export async function renderRosterPdfBase64(doc: RosterDocument): Promise<string> {
  const buffer = await renderToBuffer(<RosterPdf doc={doc} />);
  return buffer.toString("base64");
}
