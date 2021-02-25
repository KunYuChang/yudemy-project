const mongoose = require("mongoose");
const passportLocalMongoose = require("passport-local-mongoose");

// 因為有passport-local-mongoose所以不須設定密碼相關Schema
const userSchema = new mongoose.Schema({
    fullname: {
        type: String,
    },
    usertype: {
        type: String,
    },
    username: {
        type: String,
    },
    courses: {
        type: [String],
        default: [],
    },
})

// 给UserSchema添加了一个插件，使得User的Model擁有了一些有關驗證和加密的方法。
userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User", userSchema);
module.exports = User;