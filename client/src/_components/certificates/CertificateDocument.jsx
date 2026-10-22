"use client";

import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";

// Landscape A4 KIT certificate. Pure react-pdf primitives — no external fonts
// or images so the bundle stays light and the PDF renders identically across
// platforms.

const TEAL = "#10B981";
const NAVY = "#0B1220";
const MUTED = "#6B7280";
const LIGHT = "#9CA3AF";

const styles = StyleSheet.create({
  page: { backgroundColor: "#FFFFFF", flexDirection: "column" },

  topBand: {
    height: 60,
    backgroundColor: TEAL,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 36,
  },
  logo: { color: "#FFFFFF", fontSize: 16, fontWeight: 700 },
  ribbon: { color: "#FFFFFF", fontSize: 10, letterSpacing: 4 },

  content: {
    flexGrow: 1,
    paddingHorizontal: 60,
    paddingVertical: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  certifyLabel: {
    fontSize: 10,
    color: MUTED,
    letterSpacing: 2,
    marginBottom: 14,
  },
  studentName: {
    fontSize: 36,
    fontWeight: 700,
    color: NAVY,
    marginBottom: 8,
  },
  underline: {
    width: 200,
    height: 2,
    backgroundColor: TEAL,
    marginBottom: 18,
  },
  hasCompleted: { fontSize: 12, color: MUTED, marginBottom: 12 },
  courseName: {
    fontSize: 24,
    fontWeight: 700,
    color: TEAL,
    marginBottom: 10,
  },
  scoreLine: { fontSize: 14, color: NAVY },

  detailsRow: {
    flexDirection: "row",
    justifyContent: "center",
    paddingHorizontal: 60,
    paddingBottom: 24,
  },
  detailCol: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 12,
    borderRightWidth: 1,
    borderRightColor: "#E5E7EB",
  },
  detailColLast: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 12,
  },
  detailLabel: {
    fontSize: 8,
    color: LIGHT,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  detailValue: { fontSize: 11, color: NAVY, fontWeight: 700 },

  bottomGrid: {
    flexDirection: "row",
    paddingHorizontal: 60,
    paddingBottom: 36,
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  bottomCol: { flex: 1 },
  issuedBy: { fontSize: 11, fontWeight: 700, color: NAVY },
  licensed: { fontSize: 8, color: MUTED, marginTop: 3 },
  issueDate: { fontSize: 8, color: MUTED, marginTop: 2 },

  sealWrap: { alignItems: "center", flex: 1 },
  seal: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 2,
    borderColor: TEAL,
    alignItems: "center",
    justifyContent: "center",
  },
  sealText: { color: TEAL, fontSize: 14, fontWeight: 700 },
  sealCaption: { fontSize: 7, color: TEAL, marginTop: 4, letterSpacing: 1 },

  signatureCol: { flex: 1, alignItems: "flex-end" },
  signatureLine: {
    width: 160,
    height: 1,
    backgroundColor: NAVY,
    marginBottom: 4,
  },
  signatureLabel: { fontSize: 8, color: MUTED, marginBottom: 2 },
  signatureName: { fontSize: 10, fontWeight: 700, color: NAVY },

  bottomBand: {
    height: 40,
    backgroundColor: NAVY,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 36,
  },
  bandText: { color: "#9CA3AF", fontSize: 8 },
  bandCenter: { color: "#FFFFFF", fontSize: 9, letterSpacing: 1 },
});

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return value;
  }
}

function verificationCode(id) {
  return `KIT-${(id || "").toUpperCase().replace(/[^A-Z0-9]/g, "")}-VERIFY`;
}

export function CertificateDocument({ cert }) {
  return (
    <Document title={`KIT Certificate — ${cert.course_title}`}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        {/* Top band */}
        <View style={styles.topBand}>
          <Text style={styles.logo}>Kids In Tech</Text>
          <Text style={styles.ribbon}>CERTIFICATE OF COMPLETION</Text>
        </View>

        {/* Main content */}
        <View style={styles.content}>
          <Text style={styles.certifyLabel}>THIS IS TO CERTIFY THAT</Text>
          <Text style={styles.studentName}>{cert.student_name}</Text>
          <View style={styles.underline} />
          <Text style={styles.hasCompleted}>has successfully completed</Text>
          <Text style={styles.courseName}>{cert.course_title}</Text>
          {cert.score_average != null && (
            <Text style={styles.scoreLine}>
              with a score of {cert.score_average}%
            </Text>
          )}
        </View>

        {/* Details row */}
        <View style={styles.detailsRow}>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>COMPLETION DATE</Text>
            <Text style={styles.detailValue}>{formatDate(cert.completion_date)}</Text>
          </View>
          <View style={styles.detailCol}>
            <Text style={styles.detailLabel}>ISSUED BY</Text>
            <Text style={styles.detailValue}>{cert.issued_by ?? "Starnova Labs"}</Text>
          </View>
          <View style={styles.detailColLast}>
            <Text style={styles.detailLabel}>COURSE DURATION</Text>
            <Text style={styles.detailValue}>{cert.course_duration ?? "12 weeks"}</Text>
          </View>
        </View>

        {/* Bottom grid */}
        <View style={styles.bottomGrid}>
          <View style={styles.bottomCol}>
            <Text style={styles.issuedBy}>Issued by: Starnova Labs</Text>
            <Text style={styles.licensed}>Licensed & Accredited by Kids In Tech</Text>
            <Text style={styles.issueDate}>Issue date: {formatDate(cert.completion_date)}</Text>
          </View>
          <View style={styles.sealWrap}>
            <View style={styles.seal}>
              <Text style={styles.sealText}>KIT</Text>
            </View>
            <Text style={styles.sealCaption}>VERIFIED</Text>
          </View>
          <View style={styles.signatureCol}>
            <View style={styles.signatureLine} />
            <Text style={styles.signatureLabel}>Authorised Signature</Text>
            <Text style={styles.signatureName}>
              {cert.instructor_name ?? "Course Instructor"}
            </Text>
          </View>
        </View>

        {/* Bottom band */}
        <View style={styles.bottomBand}>
          <Text style={styles.bandText}>Certificate ID: {cert.id}</Text>
          <Text style={styles.bandCenter}>kidsintech.school</Text>
          <Text style={styles.bandText}>{verificationCode(cert.id)}</Text>
        </View>
      </Page>
    </Document>
  );
}

/**
 * Generates a Blob for the cert and triggers a download. Imports
 * `@react-pdf/renderer` lazily so the heavy dependency stays out of the
 * initial bundle.
 */
export async function downloadCertificate(certData) {
  const { pdf } = await import("@react-pdf/renderer");
  const blob = await pdf(<CertificateDocument cert={certData} />).toBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `KIT-Certificate-${certData.course_title.replace(/\s+/g, "-")}.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}
