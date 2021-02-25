require("dotenv").config(); // 隱藏敏感資料
const express = require("express");
const app = express();
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const path = require("path");
const User = require("./models/user");
const session = require("express-session");
const passport = require("passport");
const LocalStrategy = require("passport-local");
const flash = require("connect-flash");
const Course = require("./models/course");

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.use(
  session({
    secret: process.env.SECRET,
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());
// authenticate user
passport.use(new LocalStrategy(User.authenticate())); //設定驗證機制是本地驗證（LocalStrategy）：「在 Node.js 應用程式中，是透過帳號及密碼完成驗證」，是個必要設定之一。
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());
app.use(flash());
app.use((req, res, next) => {
  // ejs可以直接使用locals這個object的method
  res.locals.success_msg = req.flash("success_msg");
  res.locals.err_msg = req.flash("err_msg");
  res.locals.error = req.flash("error"); // passport給的資訊
  next();
});

// middleware functions
function isLoggedIn(req, res, next) {
  if (!req.isAuthenticated()) {
    req.session.returnTo = req.originalUrl; // redirect 之前的 url
    req.flash("err_msg", "Please login first before accessing this page.");
    res.redirect("/login");
  } else {
    next();
  }
}

function isStudent(req, res, next) {
  if (req.user.usertype !== "Student") {
    res.status(403).render("errorViews/403");
  } else {
    next();
  }
}

function isTeacher(req, res, next) {
  if (req.user.usertype !== "Teacher") {
    res.status(403).render("errorViews/403");
  } else {
    next();
  }
}

// connect to mongoDB
mongoose
  .connect("mongodb://localhost:27017/yudemyDB", {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    useFindAndModify: false,
  })
  .then(() => {
    console.log("Successfully connnecting to mongoDB.");
  })
  .catch((e) => {
    console.log(e);
  });

app.get("/", (req, res) => {
  res.render("index");
});

app.get("/login", (req, res) => {
  res.render("login");
});

app.post(
  "/login",
  passport.authenticate("local", { // 要讓passport知道使用者已經被認證過，所以下一次不用再登入
    failureFlash: true, // 登入失敗是否給msg (設定true自動會做出flash : error)
    failureRedirect: "/login", 
  }),
  (req, res) => {
    if (req.session.returnTo) {
      let newRoute = req.session.returnTo;
      req.session.returnTo = "";
      res.redirect(newRoute);
    } else {
      if (req.user.usertype == "Student") {
        res.redirect("/student/index");
      } else {
        res.redirect("/teacher/index");
      }
    }
  }
);

// student routes
app.get("/student/index", isLoggedIn, isStudent, async (req, res, next) => {
  let { _id } = req.user;
  try {
    let student = await User.findOne({ _id });
    let coursesFound = await Course.find({ _id: { $in: student.courses } });
    res.render("studentViews/index", { user: req.user, courses: coursesFound });
  } catch (err) {
    next(err);
  }
});

app.get("/student/find", isLoggedIn, isStudent, (req, res) => {
  res.render("studentViews/find", { user: req.user, courses: null });
});

// courses route
app.get("/courses/find", isLoggedIn, isStudent, async (req, res) => {
  let { key } = req.query;
  let coursesFound = await Course.find({ name: key });
  res.render("studentViews/find", { user: req.user, courses: coursesFound });
});

app.get("/courses/:key", isLoggedIn, isStudent, async (req, res, next) => {
  let { _id } = req.user;
  let { key } = req.params;
  try {
    let currentUser = await User.findOne({ _id });
    currentUser.courses.push(key);
    await currentUser.save();
    let currentCourse = await Course.findOne({ _id: key });
    currentCourse.student.push(currentUser._id);
    await currentCourse.save();
    res.redirect("/student/index");
  } catch {
    next(err);
  }
});

// teacher routes
app.get("/teacher/index", isLoggedIn, isTeacher, async (req, res) => {
  console.log(req.user)
  let { _id } = req.user;
  try {
    let teacher = await User.findOne({ _id });
    let coursesFound = await Course.find({ _id: { $in: teacher.courses } });
    res.render("teacherViews/index", {
      user: req.user,
      courses: coursesFound,
    });
  } catch (err) {
    next(err);
  }
});

app.get("/teacher/create", isLoggedIn, isTeacher, (req, res) => {
  res.render("teacherViews/create", { user: req.user });
});

app.post("/teacher/create", isLoggedIn, isTeacher, async (req, res) => {
  let { courseName, description, price } = req.body;
  let { _id, fullname } = req.user;
  try {
    let newCourse = new Course({
      name: courseName,
      description,
      price,
      author: fullname,
      author_id: _id,
    });
    let data = await newCourse.save();
    let author = await User.findOne({ _id });
    author.courses.push(data._id);
    await author.save();
    res.redirect("/teacher/index");
  } catch {
    req.flash(
      "err_msg",
      "Error with creating your course. Please check with admin."
    );
    res.redirect("/teacher/create");
  }
});

app.get("/register", (req, res) => {
  res.render("register");
});

// 註冊POST到後端
app.post("/register", async (req, res, next) => {
  let { fullname, usertype, username, password, password2 } = req.body;

  if (password !== password2) {
    req.flash("err_msg", "密碼不一致，請確認。");
    res.redirect("/register");
  } else {
    try {
      let foundUser = await User.findOne({ username });
      if (foundUser) {
        req.flash("err_msg", "信箱已被註冊，請確認。");
        res.redirect("/register");
      } else {
        let newUser = new User(req.body);
        await User.register(newUser, password);
        req.flash(
          "success_msg",
          "帳號創立完成，現在可以進行登入。"
        );
        res.redirect("/login");
      }
    } catch (err) {
      next(err);
    }
  }
});

app.get("/logout", (req, res) => {
  req.logOut();
  res.redirect("/");
});

app.get("/*", (req, res) => {
  res.status(404).render("errorViews/404");
});

app.use(function (err, req, res, next) {
  console.log(err);
  res.status(500).render("errorViews/500");
});

app.listen(3000, () => {
  console.log("Server is now running on port 3000.");
});

