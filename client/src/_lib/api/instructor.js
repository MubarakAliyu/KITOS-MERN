import { apiClient } from "./client";

export const getInstructorProfile = () =>
  apiClient.get("/instructors/me").then((r) => r.data);

export const getInstructorCourses = () =>
  apiClient.get("/instructors/me/courses").then((r) => r.data);

export const getInstructorStudents = () =>
  apiClient.get("/instructors/me/students").then((r) => r.data);

export const getInstructorAssignments = () =>
  apiClient.get("/assignments/instructor").then((r) => r.data);

export const submitFeedback = (assignmentId, data) =>
  apiClient
    .put(`/assignments/${assignmentId}/feedback`, data)
    .then((r) => r.data);

export const createCourse = (data) =>
  apiClient.post("/courses", data).then((r) => r.data);

export const createModule = (data) =>
  apiClient.post("/modules", data).then((r) => r.data);

export const createLesson = (data) =>
  apiClient.post("/lessons", data).then((r) => r.data);

export const createQuiz = (data) =>
  apiClient.post("/quizzes", data).then((r) => r.data);

export const createAssignment = (data) =>
  apiClient.post("/assignments", data).then((r) => r.data);

export const updateAssignment = (id, data) =>
  apiClient.put(`/assignments/${id}`, data).then((r) => r.data);

export const deleteQuiz = (id) =>
  apiClient.delete(`/quizzes/${id}`).then((r) => r.data);

export const updateQuiz = (id, data) =>
  apiClient.put(`/quizzes/${id}`, data).then((r) => r.data);
