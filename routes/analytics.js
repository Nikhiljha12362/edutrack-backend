const express = require('express');
const router = express.Router();
const Progress = require('../models/Progress');
const Course = require('../models/Course');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @GET /api/analytics/student - Student's own analytics
router.get('/student', protect, async (req, res) => {
  try {
    const allProgress = await Progress.find({ student: req.user._id })
      .populate('course', 'title category totalDuration lessons thumbnail');

    const totalCourses = allProgress.length;
    const completedCourses = allProgress.filter(p => p.isCompleted).length;
    const totalTimeSpent = allProgress.reduce((sum, p) => sum + (p.totalTimeSpent || 0), 0);
    const avgProgress = totalCourses > 0
      ? Math.round(allProgress.reduce((sum, p) => sum + p.overallProgress, 0) / totalCourses)
      : 0;

    // Weekly activity - last 7 days
    const weeklyActivity = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toDateString();
      let minutes = 0;
      allProgress.forEach(p => {
        p.activityLog.forEach(log => {
          if (new Date(log.date).toDateString() === dayStr) {
            minutes += log.minutesSpent || 0;
          }
        });
      });
      weeklyActivity.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        date: date.toISOString().split('T')[0],
        minutes
      });
    }

    // Category breakdown
    const categoryMap = {};
    allProgress.forEach(p => {
      if (p.course && p.course.category) {
        const cat = p.course.category;
        if (!categoryMap[cat]) categoryMap[cat] = { count: 0, timeSpent: 0 };
        categoryMap[cat].count++;
        categoryMap[cat].timeSpent += p.totalTimeSpent || 0;
      }
    });
    const categoryBreakdown = Object.entries(categoryMap).map(([name, data]) => ({ name, ...data }));

    // Quiz performance
    const allQuizScores = [];
    allProgress.forEach(p => p.quizScores.forEach(q => allQuizScores.push(q)));
    const avgQuizScore = allQuizScores.length > 0
      ? Math.round(allQuizScores.reduce((sum, q) => sum + (q.score / q.totalQuestions) * 100, 0) / allQuizScores.length)
      : 0;

    // Current streak
    const maxStreak = allProgress.reduce((max, p) => Math.max(max, p.streak || 0), 0);

    // Monthly progress - last 6 months
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const month = date.toLocaleDateString('en-US', { month: 'short' });
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
      let completions = 0;
      allProgress.forEach(p => {
        if (p.completedAt && p.completedAt >= monthStart && p.completedAt <= monthEnd) completions++;
      });
      monthlyData.push({ month, completions });
    }

    res.json({
      success: true,
      analytics: {
        totalCourses, completedCourses, totalTimeSpent,
        avgProgress, avgQuizScore, maxStreak,
        weeklyActivity, categoryBreakdown, monthlyData,
        recentProgress: allProgress.slice(0, 5)
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @GET /api/analytics/instructor - Instructor analytics
router.get('/instructor', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const courses = await Course.find({ instructor: req.user._id });
    const courseIds = courses.map(c => c._id);
    const allProgress = await Progress.find({ course: { $in: courseIds } })
      .populate('student', 'name email')
      .populate('course', 'title');

    const totalStudents = new Set(allProgress.map(p => p.student._id.toString())).size;
    const totalEnrollments = allProgress.length;
    const completionRate = totalEnrollments > 0
      ? Math.round((allProgress.filter(p => p.isCompleted).length / totalEnrollments) * 100)
      : 0;

    const courseStats = courses.map(course => {
      const courseProgress = allProgress.filter(p => p.course._id.toString() === course._id.toString());
      const avgProgress = courseProgress.length > 0
        ? Math.round(courseProgress.reduce((sum, p) => sum + p.overallProgress, 0) / courseProgress.length)
        : 0;
      return {
        courseId: course._id,
        title: course.title,
        enrollments: courseProgress.length,
        avgProgress,
        completions: courseProgress.filter(p => p.isCompleted).length,
        rating: course.averageRating
      };
    });

    res.json({
      success: true,
      analytics: { totalStudents, totalEnrollments, completionRate, courseStats }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @GET /api/analytics/admin - Admin platform analytics
router.get('/admin', protect, authorize('admin'), async (req, res) => {
  try {
    const [totalUsers, totalCourses, totalProgress] = await Promise.all([
      User.countDocuments(),
      Course.countDocuments({ isPublished: true }),
      Progress.countDocuments()
    ]);
    const students = await User.countDocuments({ role: 'student' });
    const instructors = await User.countDocuments({ role: 'instructor' });
    const completedCourses = await Progress.countDocuments({ isCompleted: true });

    res.json({
      success: true,
      analytics: { totalUsers, totalCourses, totalProgress, students, instructors, completedCourses }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
