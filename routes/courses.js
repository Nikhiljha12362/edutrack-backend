const express = require('express');
const router = express.Router();
const Course = require('../models/Course');
const Progress = require('../models/Progress');
const User = require('../models/User');
const { protect, authorize } = require('../middleware/auth');

// @GET /api/courses - Get all published courses
router.get('/', async (req, res) => {
  try {
    const { category, level, search, page = 1, limit = 12 } = req.query;
    const query = { isPublished: true };
    if (category) query.category = category;
    if (level) query.level = level;
    if (search) query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
    const courses = await Course.find(query)
      .populate('instructor', 'name avatar')
      .select('-lessons.quiz')
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 });
    const total = await Course.countDocuments(query);
    res.json({ success: true, courses, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @GET /api/courses/:id - Get single course
router.get('/:id', async (req, res) => {
  try {
    const course = await Course.findById(req.params.id)
      .populate('instructor', 'name avatar bio')
      .populate('enrolledStudents', 'name avatar');
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @POST /api/courses - Create course (instructor/admin)
router.post('/', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const course = await Course.create({ ...req.body, instructor: req.user._id });
    res.status(201).json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @PUT /api/courses/:id - Update course
router.put('/:id', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (course.instructor.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    course = await Course.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, course });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @POST /api/courses/:id/enroll - Enroll in course
router.post('/:id/enroll', protect, async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    if (course.enrolledStudents.includes(req.user._id)) {
      return res.status(400).json({ success: false, message: 'Already enrolled' });
    }
    course.enrolledStudents.push(req.user._id);
    await course.save();
    await User.findByIdAndUpdate(req.user._id, { $push: { enrolledCourses: course._id } });
    await Progress.create({ student: req.user._id, course: course._id });
    res.json({ success: true, message: 'Enrolled successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @POST /api/courses/:id/rate - Rate a course
router.post('/:id/rate', protect, async (req, res) => {
  try {
    const { rating, review } = req.body;
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    const existingRating = course.ratings.find(r => r.user.toString() === req.user._id.toString());
    if (existingRating) {
      existingRating.rating = rating;
      existingRating.review = review;
    } else {
      course.ratings.push({ user: req.user._id, rating, review });
    }
    course.calculateAverageRating();
    await course.save();
    res.json({ success: true, averageRating: course.averageRating });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @DELETE /api/courses/:id - Delete course
router.delete('/:id', protect, authorize('instructor', 'admin'), async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);
    if (!course) return res.status(404).json({ success: false, message: 'Course not found' });
    await course.deleteOne();
    res.json({ success: true, message: 'Course deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
