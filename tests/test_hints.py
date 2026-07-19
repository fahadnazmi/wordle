import unittest

from app import GAMES, app


class HintSystemTests(unittest.TestCase):
    def setUp(self):
        self.client = app.test_client()
        GAMES.clear()

    def test_correct_answer_reveals_a_new_letter(self):
        self.client.post("/api/new", json={"word_length": 5, "max_guesses": 6})

        question_resp = self.client.get("/api/hint/question")
        self.assertEqual(question_resp.status_code, 200)
        question_data = question_resp.get_json()
        self.assertEqual(question_data["difficulty"], "easy")
        self.assertIn("question", question_data)

        answer_resp = self.client.post(
            "/api/hint/answer",
            json={"answer": question_data["question"]["answer"]},
        )
        self.assertEqual(answer_resp.status_code, 200)
        payload = answer_resp.get_json()
        self.assertTrue(payload["correct"])
        self.assertIn("revealed_letter", payload)
        self.assertEqual(payload["remaining_hints"], 2)
        self.assertIn(payload["revealed_letter"], payload["message"])

        state_resp = self.client.get("/api/state")
        state_data = state_resp.get_json()
        self.assertIn(payload["revealed_letter"].lower(), [v.lower() for v in state_data["known_letters"]])

    def test_wrong_answer_wastes_a_hint(self):
        self.client.post("/api/new", json={"word_length": 5, "max_guesses": 6})

        self.client.get("/api/hint/question")
        answer_resp = self.client.post("/api/hint/answer", json={"answer": "wrong-answer"})

        self.assertEqual(answer_resp.status_code, 200)
        payload = answer_resp.get_json()
        self.assertFalse(payload["correct"])
        self.assertEqual(payload["remaining_hints"], 2)
        self.assertIn("incorrect", payload["message"].lower())

    def test_guess_results_update_known_letters(self):
        self.client.post("/api/new", json={"word_length": 5, "max_guesses": 6})

        guess_resp = self.client.post("/api/guess", json={"guess": "apple"})
        self.assertEqual(guess_resp.status_code, 200)
        state_data = guess_resp.get_json()
        self.assertIn("known_letters", state_data)
        self.assertTrue(state_data["known_letters"])


if __name__ == "__main__":
    unittest.main()
