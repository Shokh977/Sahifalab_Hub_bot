import React, { useState, useEffect } from 'react'
import apiService from '@services/apiService'

interface Quiz {
  id: number
  title: string
  bookTitle: string
  questions: number
  difficulty: 'easy' | 'medium' | 'hard'
  category: string
}

interface QuizQuestion {
  id: number
  question: string
  options: string[]
  correctAnswer: number
  explanation: string
}

export const QuizPage: React.FC = () => {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [selectedQuiz, setSelectedQuiz] = useState<Quiz | null>(null)
  const [questions, setQuestions] = useState<QuizQuestion[]>([])
  const [currentQuestion, setCurrentQuestion] = useState(0)
  const [score, setScore] = useState(0)
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>([])
  const [loading, setLoading] = useState(true)
  const [showResults, setShowResults] = useState(false)

  useEffect(() => {
    const fetchQuizzes = async () => {
      try {
        const response = await apiService.getQuizzes()
        setQuizzes(response.data)
      } catch (error) {
        console.error('Failed to fetch quizzes:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchQuizzes()
  }, [])

  const startQuiz = async (quiz: Quiz) => {
    try {
      const response = await apiService.getQuizQuestions(quiz.id)
      setQuestions(response.data)
      setSelectedQuiz(quiz)
      setCurrentQuestion(0)
      setScore(0)
      setSelectedAnswers(new Array(response.data.length).fill(null))
      setShowResults(false)
    } catch (error) {
      console.error('Failed to fetch quiz questions:', error)
    }
  }

  const handleAnswerSelect = (optionIndex: number) => {
    const newAnswers = [...selectedAnswers]
    newAnswers[currentQuestion] = optionIndex
    setSelectedAnswers(newAnswers)

    // Check if correct
    if (optionIndex === questions[currentQuestion].correctAnswer) {
      setScore((prev) => prev + 1)
    }
  }

  const goToNext = () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion((prev) => prev + 1)
    } else {
      setShowResults(true)
    }
  }

  const goToPrevious = () => {
    if (currentQuestion > 0) {
      setCurrentQuestion((prev) => prev - 1)
    }
  }

  const resetQuiz = () => {
    setSelectedQuiz(null)
    setQuestions([])
    setCurrentQuestion(0)
    setScore(0)
    setSelectedAnswers([])
    setShowResults(false)
  }

  const getScorePercentage = () => {
    return Math.round((score / questions.length) * 100)
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300'
      case 'hard':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Quiz List View
  if (!selectedQuiz) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            📝 Quiz
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Test your knowledge with book-based quizzes
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card animate-pulse">
                <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
              </div>
            ))}
          </div>
        ) : quizzes.length === 0 ? (
          <div className="card text-center py-8">
            <p className="text-gray-600 dark:text-gray-400">No quizzes available</p>
          </div>
        ) : (
          <div className="space-y-3">
            {quizzes.map((quiz) => (
              <button
                key={quiz.id}
                onClick={() => startQuiz(quiz)}
                className="card w-full text-left hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start gap-4">
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 dark:text-white">
                      {quiz.title}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      📕 {quiz.bookTitle}
                    </p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 px-2 py-1 rounded">
                        {quiz.questions} questions
                      </span>
                      <span className={`text-xs px-2 py-1 rounded ${getDifficultyColor(quiz.difficulty)}`}>
                        {quiz.difficulty}
                      </span>
                    </div>
                  </div>
                  <div className="text-2xl">→</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Quiz Results View
  if (showResults) {
    const percentage = getScorePercentage()
    const getPerfomanceMessage = () => {
      if (percentage >= 80) return '🌟 Excellent!'
      if (percentage >= 60) return '👍 Good job!'
      if (percentage >= 40) return '📚 Keep studying!'
      return '💪 Try again!'
    }

    return (
      <div className="space-y-6">
        <button
          onClick={resetQuiz}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
        >
          ← Back to Quizzes
        </button>

        <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 text-center space-y-4">
          <div className="text-5xl">{percentage >= 80 ? '🏆' : percentage >= 60 ? '🎯' : '📚'}</div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {getPerfomanceMessage()}
            </h2>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 mt-2">
              {percentage}%
            </p>
            <p className="text-gray-600 dark:text-gray-400 mt-2">
              You got {score} out of {questions.length} questions correct
            </p>
          </div>
        </div>

        <div className="card space-y-3">
          <h3 className="font-bold text-gray-900 dark:text-white">Review</h3>
          {questions.map((q, index) => (
            <div
              key={q.id}
              className={`p-3 rounded-lg border-l-4 ${
                selectedAnswers[index] === q.correctAnswer
                  ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                  : 'border-red-500 bg-red-50 dark:bg-red-900/20'
              }`}
            >
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {index + 1}. {q.question}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                {selectedAnswers[index] === q.correctAnswer ? '✓ Correct' : '✗ Incorrect'}
              </p>
            </div>
          ))}
        </div>

        <button
          onClick={resetQuiz}
          className="btn-primary w-full"
        >
          Try Another Quiz
        </button>
      </div>
    )
  }

  // Quiz Question View
  const question = questions[currentQuestion]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          onClick={resetQuiz}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline mb-3"
        >
          ← Exit Quiz
        </button>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          {selectedQuiz.title}
        </h2>
        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
          Question {currentQuestion + 1} of {questions.length}
        </p>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${((currentQuestion + 1) / questions.length) * 100}%` }}
        ></div>
      </div>

      {/* Question */}
      <div className="card bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/30 space-y-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {question.question}
        </h3>

        {/* Options */}
        <div className="space-y-2">
          {question.options.map((option, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              className={`w-full p-3 rounded-lg text-left transition-all border-2 ${
                selectedAnswers[currentQuestion] === index
                  ? 'border-blue-600 bg-blue-100 dark:bg-blue-900/40'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-blue-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-sm font-bold ${
                    selectedAnswers[currentQuestion] === index
                      ? 'border-blue-600 bg-blue-600 text-white'
                      : 'border-gray-400 dark:border-gray-600'
                  }`}
                >
                  {selectedAnswers[currentQuestion] === index && '✓'}
                </div>
                <span className="text-gray-900 dark:text-white">{option}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3">
        <button
          onClick={goToPrevious}
          disabled={currentQuestion === 0}
          className="flex-1 btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Previous
        </button>
        <button
          onClick={goToNext}
          disabled={selectedAnswers[currentQuestion] === null}
          className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {currentQuestion === questions.length - 1 ? 'Finish' : 'Next'} →
        </button>
      </div>
    </div>
  )
}

export default QuizPage
