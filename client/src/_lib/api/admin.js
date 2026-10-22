import { apiClient } from "./client";

export const getAdminStats = () =>
  apiClient.get("/admin/stats").then((r) => r.data);

export const getAdminUsers = () =>
  apiClient.get("/admin/users").then((r) => r.data);

export const getAdminCourses = () =>
  apiClient.get("/admin/courses").then((r) => r.data);

export const getAdminAnalytics = () =>
  apiClient.get("/admin/analytics").then((r) => r.data);

export const getAdminPayments = () =>
  apiClient.get("/admin/payments").then((r) => r.data);

export const getPendingEnrollments = () =>
  apiClient.get("/admin/pending-enrollments").then((r) => r.data);

export const deactivateUser = (id) =>
  apiClient
    .post("/admin/users/deactivate", { user_id: id })
    .then((r) => r.data);

export const activateUser = (id) =>
  apiClient.post("/admin/users/activate", { user_id: id }).then((r) => r.data);

export const assignInstructor = (data) =>
  apiClient.post("/admin/users/assign-instructor", data).then((r) => r.data);

export const createUser = (data) =>
  apiClient.post("/admin/users", data).then((r) => r.data);

export const getNextAdmissionNo = () =>
  apiClient.get("/admin/next-admission-no").then((r) => r.data);

export const createCourse = (data) =>
  apiClient.post("/admin/courses", data).then((r) => r.data);

export const updateCourse = (id, data) =>
  apiClient.put(`/admin/courses/${id}`, data).then((r) => r.data);

export const deleteCourse = (id) =>
  apiClient.delete(`/admin/courses/${id}`).then((r) => r.data);

export const publishCourse = (id) =>
  apiClient.post(`/admin/courses/${id}/publish`).then((r) => r.data);

export const unpublishCourse = (id) =>
  apiClient.post(`/admin/courses/${id}/unpublish`).then((r) => r.data);

export const sendAnnouncement = (data) =>
  apiClient.post("/admin/notifications/send", data).then((r) => r.data);

export const getActivityLog = () =>
  apiClient.get("/admin/activity-log").then((r) => r.data);

export const savePermissions = (data) =>
  apiClient.post("/admin/permissions", data).then((r) => r.data);

export const getCourseEditor = (id) =>
  apiClient.get(`/admin/courses/${id}/editor`).then((r) => r.data);

export const updateUser = (id, data) =>
  apiClient.put(`/admin/users/${id}`, data).then((r) => r.data);
