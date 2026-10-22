import { apiClient } from "./client";

/** Returns the questions for a quiz. */
export async function getQuizQuestions(quizId) {
  const { data } = await apiClient.get(`/quizzes/${quizId}/questions`);
  return data;
}

/**
 * Submits answers and returns the graded result.
 * @param {{ quiz_id: string, answers: Record<string, string> }} payload
 */
export async function submitQuiz(payload) {
  const { data } = await apiClient.post("/quiz/submit", payload);
  return data;
}
