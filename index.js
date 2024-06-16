import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import multer from "multer";
import morgan from "morgan";
import cors from "cors";
import fs from "fs";
import fuzzySearch from "mongoose-fuzzy-searching";
import session from "express-session";
import passport from "passport";
import passportLocalMongoose from "passport-local-mongoose";
import { type } from "os";
import MongoStore from "connect-mongo";
import { time } from "console";

//Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'public/images');
  },
  filename: (req, file, cb) => {
    console.log("Mutler", file.originalname);
    req.body.imageFilename = file.originalname;
    cb(null, file.originalname);
  },
});
const upload = multer({ storage: storage });

//Express connection
const app = express();
const PORT = process.env.PORT || 3000
const allowedHeaders = 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Set-Cookie';
const corsOptions = {
  //To allow requests from client
  origin: ['http://localhost:3000','http://localhost:5173'],
  allowedHeaders: allowedHeaders,
  "preflightContinue": false,
  "optionsSuccessStatus": 204,
  credentials: true,
  exposedHeaders: ["set-cookie"],
};


app.use(express.static('public'))
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(morgan('dev'));
app.use(cors(corsOptions));
app.use(session({
  secret: 'MXYAIVOY5O7FWZY577K5A54QXIZ5IV',
  resave: false,
  store: MongoStore.create({ mongoUrl: 'mongodb+srv://admin-harshit:test123@cluster0.5v6tyuh.mongodb.net/best-store', ttl: 60 * 60 * 24 , autoRemove: 'native' }),
  saveUninitialized: false,
  cookie: { httpOnly: true , maxAge: 1000 * 60 * 60 * 24, sameSite : 'none' ,secure : true }
}))

app.use(passport.initialize());
app.use(passport.session());


app.listen(PORT, () => {
  console.log(`⚡️[server]: Server is running at http://localhost:${PORT}`);
});

//MongoDB connection
mongoose
  .connect("mongodb+srv://admin-harshit:test123@cluster0.5v6tyuh.mongodb.net/best-store")
  .then(() => console.log("MongoDB connected"))
  .catch((err) => console.log(err));

//Product Schema
const productSchema = new mongoose.Schema({
  id: ({ type: Number, unique: true, required: true }),
  name: ({ type: String, required: true }),
  brand: ({ type: String, required: true }),
  category: ['Computers', 'Phones', 'Printers', 'Accessories', 'Other'],
  price: ({ type: Number, required: true }),
  description: ({ type: String }),
  imageFilename: ({ type: String, default: 'default.png', required: true }),
  createdAt: ({ type: Date, default: Date.now })
});
productSchema.index({ name: 'text', brand: 'text', category: 'text', description: 'text' });
productSchema.plugin(fuzzySearch, { fields: ['name', 'brand', 'category', 'description'] });
const Product = mongoose.model("Products", productSchema);

//User Schema 
const userSchema = new mongoose.Schema({
  id: ({ type: Number, unique: true, required: true }),
  firstName: ({ type: String, required: true }),
  lastName: ({ type: String, required: true }),
  phoneNumber: ({ type: Number }),
  address: ({ type: String }),
  username: ({ type: String, unique: true, required: true }),
  password: ({ type: String }),
  role: ['admin', 'user'],
  cart: {
    type: Object,
    default: {}
  },
  orderHistory: {
    type: Array,
    default: []
  }
});
userSchema.plugin(passportLocalMongoose);
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

//Sample Route
app.get("/",(req,res) => {
  res.json({message : "HI"});
})
//Product Routes
app.get("/product/:id", (req, res) => {
  Product.findOne({ id: req.params.id })
    .then((data) => {
      res.json(data);
    })
    .catch((err) => console.log(err))
})                                                            //Route to get one product

app.get("/products", async (req, res) => {
  var filter = {};
  req.query.category && (filter.category = req.query.category);
  req.query.brand && (filter.brand = req.query.brand);
  res.setHeader('Access-Control-Expose-Headers', '*');
  const limit = parseInt(req.query._limit);
  const page = parseInt(req.query._page);
  const offset = (page - 1) * req.query._limit;
  try {
    const d = await Product.find({ $and: [req.query.q !== "" ? { $text: { $search: req.query.q } } : {}, filter] }).count();
    console.log(d);
    res.setHeader('X-Total-Count', d);
  } catch (err) {
    console.log(err);
  }
  if (req.query._sort && req.query._order) {
    console.log(req.query.q);
    Product.find({ $and: [req.query.q !== "" ? { $text: { $search: req.query.q } } : {}, filter] }).sort({ [req.query._sort]: parseInt(req.query._order) }).skip(offset).limit(limit)
      .then((data) => {
        res.json(data);
      })
      .catch((err) => console.log(err))
  } else {
    Product.find()
      .then((data) => {
        res.json(data);
      })
      .catch((err) => console.log(err))
  }
})                                                             //Route to get all products

app.post("/product/add/", upload.array(), (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    console.log(req.body);
    var errors = {};
    const date = new Date();
    req.body.createdAt = date.toISOString();
    req.body.price = parseInt(req.body.price);
    if (req.body.name.length < 3) {
      errors.name = ("Name must be at least 3 characters long");
    }
    if (req.body.brand.length < 3) {
      errors.brand = ("Brand must be at least 3 characters long");
    }
    if (req.body.price < 0) {
      errors.price = ("Price not valid");
    }
    if (req.body.category.length < 3) {
      errors.category = ("Category must be at least 3 characters long");
    }
    if (req.body.description.length < 10) {
      errors.description = ("Description must be at least 3 characters long");
    }
    if (Object.keys(errors).length !== 0) {
      res.status(400).json(errors);
      return;
    } else {
      console.log(errors);
      const count = Product.find().count().then(count => {
        req.body.id = count + 1
        const newProduct = new Product();
        newProduct.id = req.body.id
        newProduct.name = req.body.name;
        newProduct.brand = req.body.brand;
        newProduct.category = req.body.category;
        newProduct.price = req.body.price;
        newProduct.description = req.body.description;
        newProduct.imageFilename = req.body.imageFilename;
        newProduct.createdAt = req.body.createdAt;
        newProduct.save()
          .then((data) => {
            res.json(data);
          })
          .catch((err) => console.log(err))
      })

    }
  } else {
    res.status(401).send("Not authorized");
  }
});                                                            //Route to add new product

app.patch("/product/edit/:id", upload.array(), (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    console.log("Authenticated");

    console.log("Body", req.body);
    Product.findOneAndUpdate({ id: parseInt(req.params.id) }, req.body)
      .then((data) => {
        console.log(data);
        res.status(200);
        res.json(data);
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})                                                             //Route to edit one product

app.delete("/product/delete/:id", (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    Product.findOneAndDelete({ id: parseInt(req.params.id) })
      .then((data) => {
        console.log(data);
        res.status(200);
        res.json(data);
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})                                                             //Route to delete one product

app.post("/image/add/", upload.single('image'), (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    console.log(req.body);
    res.setHeader('Content-Type', 'application/json');
    return res.json({ filename: req.body.imageFilename })
  } else { res.status(401).send("Not authorized") }       //Route to add image
})

app.patch("/image/add/", upload.single('file'), (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    console.log("ImgPatch request body", req.body);
    fs.unlink('public/images/' + req.body.image, (err) => {
      if (err) {
        console.error(err);
      } else {
        console.log('File is deleted.');
      }
    });
    console.log(req.body);
    res.setHeader('Content-Type', 'application/json');
    console.log("ImgPatch response", req.body.imageFilename);
    return res.json({ filename: req.body.imageFilename })
  } else { res.status(401).send("Not authorized") }
})                                                              //Route to edit image

//Auth Routes
app.post("/user/register/", upload.array(), async (req, res) => {
  const id = await User.find().count() + 1;
  console.log("Body", req.body);
  const user = {
    id: id,
    username: req.body.username,
    firstName: req.body.firstName,
    lastName: req.body.lastName,
    role: "user",
    ...(req.body.phoneNumber && { phoneNumber: req.body.phoneNumber }),
    ...(req.body.address && { address: req.body.address }),
  }
  User.register(user, req.body.password, (err, user) => {
    if (err) {
      console.log("Error", err);
      res.status(400);
    } else {
      passport.authenticate("local")(req, res, () => {
        res.status(200).json({
          firstName: req.user.firstName,
          lastName: req.user.lastName,
          username: req.user.username,
          role: req.user.role[0],
          id: req.user._id,
          ...(req.user.phoneNumber && { phoneNumber: req.user.phoneNumber }),
          ...(req.user.address && { address: req.user.address }),
        });
      });
    }
  })
})                                                              //Route to register new user

app.post("/user/login/", upload.array(), (req, res) => {
  // res.setHeader('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.setHeader('Access-Control-Expose-Headers', '*');
  console.log("Body", req.body);
  const user = new User({
    username: req.body.username,
    password: req.body.password
  })
  req.login(user, function (err) {
    if (err) { console.log(err); }
    passport.authenticate("local")(req, res, () => {
      res.status(200).json({
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        username: req.user.username,
        role: req.user.role[0],
        id: req.user._id,
        ...(req.user.phoneNumber && { phoneNumber: req.user.phoneNumber }),
        ...(req.user.address && { address: req.user.address }),
      });
    })
  });
})                                                              //Route to login

app.post("/user/update/", upload.array(), (req, res) => {
  console.log(req.body);
  if (req.isAuthenticated() && req.body.id === req.user._id.toString()) {
    // console
    delete req.body.id
    User.findOneAndUpdate({ username: req.body.username }, req.body,{
      new: true
    })
      .then((data) => {
        // console.log(data);
        res.status(200).json({
          username : data.username,
          firstName : data.firstName,
          lastName : data.lastName,
          role : data.role[0],
          id : data._id,
          ...(data.phoneNumber && { phoneNumber : data.phoneNumber }),
          ...(data.address && { address : data.address }),
        });
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    console.log(req.user);
    res.status(401).send("Not authorized");
  }
})

app.post("/user/updatePassword/",upload.array(), async (req, res) => {
  if (req.isAuthenticated() && req.user._id.toString() === req.body.id) {
    const user = await User.findById(req.body.id);
    user.changePassword(req.body.oldpassword, req.body.newpassword, function(err) {
      if (err) {
        res.status(400).send(err);
      } else{
        res.status(200).send("Password changed successfully");
      }
    });
  } else {
    console.log(req.user._id.toString(), req.body.id);
    res.status(401).send("Not authorized");
  }
  })
app.get("/user/secret", (req, res) => {
  console.log("secret accessed");
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    // console.log("aces",req.user);
    res.status(200);
    res.json({ secret: "Found it!" });
  } else {
    res.status(400);
    res.json({ secret: "Not found" });
  }
})

// Admin Routes
app.get("/users", async (req, res) => {
  var totalCount = 0
  res.setHeader('Access-Control-Expose-Headers', '*');
  try {
    const d = await User.find().count();
    console.log(d);
    totalCount = d
    res.setHeader('X-Total-Count', d);
  } catch (err) {
    console.log(err);
  }
  const limit = parseInt(req.query._limit);
  const page = parseInt(req.query._page);
  const offset = (page - 1) * req.query._limit;
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    User.find({},{firstName: 1, lastName: 1, username: 1, role: 1, id: 1}).sort({id : 1}).skip(offset).limit(limit)
      .then((data) => {
        // res.setHeader('X-Total-Count', data.length);
        // console.log(data.length);
        res.status(200);
        res.json({users : data, totalCount : totalCount});
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})

app.get("/userInfo/:id", async (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "admin") {
    User.findOne({id :req.params.id},{firstName: 1, lastName: 1, username: 1, role: 1, id: 1, address: 1, phoneNumber: 1})
      .then((data) => {
        res.status(200);
        res.json(data);
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})

//User Routes
app.get("/cart", (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "user") {
    res.status(200);
    res.json({ cart: req.user.cart });
  } else {
    res.status(401).send("Not authorized");
  }
})

app.post("/cart/add",upload.array(), (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "user") {
    const cartObject = {
      [req.body.id]: {
        quantity : req.body.quantity,
        ...(req.body.checked ? { checked : req.body.checked } : { checked : 1 })
      }
    }
    User.findOneAndUpdate({ username: req.user.username }, { cart: {...req.user.cart, ...cartObject } }, { new: true })
      .then((data) => {
        res.status(200);
        res.json({ cart: req.user.cart });
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})
app.delete("/cart/delete/:id", (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "user") {
    User.findOneAndUpdate({ username: req.user.username }, {$unset : { ["cart." + req.params.id] : "1" } }, { new: true })
      .then((data) => {
        res.status(200);
        res.json({ cart: data.cart });
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})
app.get("/cart/checkOut", (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "user") {
    const Order = {
      time : Date.now(),
      items : []
    }
    Object.keys(req.user.cart).map((key) => {
      if(req.user.cart[key].checked == 1){
        Order.items.push({[key]: {quantity : req.user.cart[key].quantity}})
        delete req.user.cart[key]
      }
    })
    req.user.orderHistory ? req.user.orderHistory.push(Order) : req.user.orderHistory = [Order]
    User.findOneAndUpdate({ username: req.user.username }, { cart: req.user.cart , orderHistory : req.user.orderHistory}, { new: true })
      .then((data) => {
        res.status(200);
        res.json({ cart: data.cart });
      })
      .catch((err) => {
        console.log(err)
        res.status(400);
      })
  } else {
    res.status(401).send("Not authorized");
  }
})

app.get("/orderHistory", (req, res) => {
  if (req.isAuthenticated() && req.user.role[0] === "user") {
    res.status(200);
    res.json({ orderHistory: req.user.orderHistory });
  } else {
    res.status(401).send("Not authorized");
  }
})
/* Dummy data */
/*
const products = [
  {
    "id": 1,
    "name": "MSI Pulse Pro",
    "brand": "MSI",
    "category": "Computers",
    "price": 1099,
    "description": "MSI Pulse GL66 15.6\" FHD 144Hz Gaming Laptop: Intel Core i7-12700H RTX 3070 16GB 512GB NVMe SSD",
    "imageFilename": "22866337.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 2,
    "name": "Acer Swift",
    "brand": "Acer",
    "category": "Computers",
    "price": 929,
    "description": "Acer Swift X SFX14-42G-R607 Creator Laptop | 14\" Full HD 100% sRGB | AMD Ryzen 7 5825U",
    "imageFilename": "84600886.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 3,
    "name": "Lenovo Ideapad",
    "brand": "Lenovo",
    "category": "Computers",
    "price": 799,
    "description": "Lenovo 2022 Newest Ideapad 3 Laptop, 15.6\" HD Touchscreen, 11th Gen Intel Core i3-1115G4 Processor, 8GB DDR4 RAM, 256GB PCIe NVMe SSD",
    "imageFilename": "10744695.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 4,
    "name": "Dell Latitude 7000",
    "brand": "Dell",
    "category": "Computers",
    "price": 1199,
    "description": "Dell Latitude 7000 7430 14\" Notebook - Full HD - 1920 x 1080 - Intel Core i7 12th Gen i7-1265U Deca-core (10 Core) 1.80 GHz",
    "imageFilename": "81882367.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 5,
    "name": "Dell Inspiron 15",
    "brand": "Dell",
    "category": "Computers",
    "price": 989,
    "description": "Dell Inspiron 15 3000 Series 3511 Laptop, 15.6\" FHD Touchscreen, Intel Core i5-1035G1, 32GB",
    "imageFilename": "41732775.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 6,
    "name": "Dell Inspiron 3000",
    "brand": "Dell",
    "category": "Computers",
    "price": 849,
    "description": "Dell 2022 Newest Inspiron 3000 Laptop, 15.6 HD Display, Intel Celeron N4020 Processor, 8GB DDR4 RAM",
    "imageFilename": "63529756.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 7,
    "name": "HP ENVY 200",
    "brand": "HP",
    "category": "Computers",
    "price": 869,
    "description": "HP 14\" FHD Laptop for Business and Student, AMD Ryzen3 3250U (Beat i5 7200U), 16GB RAM",
    "imageFilename": "10590390.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 8,
    "name": "HP Pavilion 15",
    "brand": "HP",
    "category": "Computers",
    "price": 789,
    "description": "HP 2023 15\" HD IPS Laptop, Windows 11, Intel Pentium 4-Core Processor Up to 2.70GHz, 8GB RAM",
    "imageFilename": "92970713.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 9,
    "name": "HP ENVY 14",
    "brand": "HP",
    "category": "Computers",
    "price": 779,
    "description": "HP Newest 14\" HD Laptop, Windows 11, Intel Celeron Dual-Core Processor Up to 2.60GHz, 4GB RAM",
    "imageFilename": "16303427.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 10,
    "name": "Keyboard MK345",
    "brand": "Logitech",
    "category": "Accessories",
    "price": 59,
    "description": "Logitech MK345 Wireless Combo Full-Sized Keyboard with Palm Rest and Mouse",
    "imageFilename": "83655305.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 11,
    "name": "Wireless Mouse",
    "brand": "Amazon",
    "category": "Accessories",
    "price": 39,
    "description": "Amazon Basics Wireless Computer Mouse with USB Nano Receiver - Black",
    "imageFilename": "11677601.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 12,
    "name": "Laptop Bag T210",
    "brand": "Lenovo",
    "category": "Accessories",
    "price": 69,
    "description": "Lenovo Laptop Shoulder Bag T210, 15.6-Inch Laptop or Tablet",
    "imageFilename": "15587367.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 13,
    "name": "Canon Pixma MG3620",
    "brand": "Canon",
    "category": "Printers",
    "price": 99,
    "description": "Canon Pixma MG3620 Wireless All-in-One Color Inkjet Printer with Mobile and Tablet Printing, Black",
    "imageFilename": "12643487.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 14,
    "name": "Brother HL-L2350DW",
    "brand": "Brother",
    "category": "Printers",
    "price": 179,
    "description": "Brother Compact Monochrome Laser Printer, HL-L2350DW, Wireless Printing",
    "imageFilename": "89890247.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 15,
    "name": "Lexmark B3442dw",
    "brand": "Lexmark",
    "category": "Printers",
    "price": 319,
    "description": "Lexmark B3442dw Black and White Laser Printer, Wireless with Ethernet, Mobile-Friendly and Cloud Connection",
    "imageFilename": "91537624.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 16,
    "name": "Panasonic LUMIX",
    "brand": "Panasonic",
    "category": "Cameras",
    "price": 499,
    "description": "Panasonic LUMIX FZ80 4K Digital Camera, 18.1 Megapixel Video Camera, 60X Zoom",
    "imageFilename": "66899970.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 17,
    "name": "KODAK PIXPRO",
    "brand": "Kodak",
    "category": "Cameras",
    "price": 299,
    "description": "KODAK PIXPRO Friendly Zoom FZ55-BL 16MP Digital Camera with 5X Optical Zoom",
    "imageFilename": "65286227.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 18,
    "name": "Sony CyberShot",
    "brand": "Sony",
    "category": "Cameras",
    "price": 999,
    "description": "Sony CyberShot RX10 IV with 0.03 Second Auto-Focus & 25x Optical Zoom",
    "imageFilename": "57415624.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 19,
    "name": "Garmin DriveSmart",
    "brand": "Garmin",
    "category": "Other",
    "price": 199,
    "description": "Garmin DriveSmart 65, Built-In Voice-Controlled GPS Navigator with 6.95\" High-Res Display , Black",
    "imageFilename": "75241241.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 20,
    "name": "SAMSUNG SmartTag",
    "brand": "Samsung",
    "category": "Other",
    "price": 89,
    "description": "SAMSUNG Galaxy SmartTag Bluetooth Smart Home Accessory Tracker, Attachment Locator for Lost Keys",
    "imageFilename": "72426380.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 21,
    "name": "Garmin Instinct",
    "brand": "Garmin",
    "category": "Other",
    "price": 79,
    "description": "Garmin Instinct, Rugged Outdoor Watch with GPS, Features Glonass and Galileo",
    "imageFilename": "35640104.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 22,
    "name": "iPhone 12",
    "brand": "Apple",
    "category": "Phones",
    "price": 969,
    "description": "Apple iPhone 12, 64GB, Black - Unlocked and compatible with any carrier of choice on GSM and CDMA networks. Tested for battery health and guaranteed to come with a battery that exceeds 90% of original capacity.",
    "imageFilename": "11736965.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 23,
    "name": "iPhone 13",
    "brand": "Apple",
    "category": "Phones",
    "price": 1299,
    "description": "Apple iPhone 13 Pro 512Go Graphite - Unlocked and compatible with any carrier of choice on GSM and CDMA networks.",
    "imageFilename": "97815739.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 24,
    "name": "iPhone 14",
    "brand": "Apple",
    "category": "Phones",
    "price": 969.8,
    "description": "Apple iPhone 14 Pro 128GB Purple",
    "imageFilename": "57380538.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 25,
    "name": "Samsung Galaxy S5",
    "brand": "Samsung",
    "category": "Phones",
    "price": 299,
    "description": "Samsung Galaxy S5 16GB Black Unlocked",
    "imageFilename": "80522267.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 26,
    "name": "SAMSUNG Galaxy S23",
    "brand": "Samsung",
    "category": "Phones",
    "price": 749,
    "description": "SAMSUNG Galaxy S23 Cell Phone, Factory Unlocked Android Smartphone, 256GB Storage, 50MP Camera, Night Mode, Long Battery Life, Adaptive Display, US Version, 2023, Lavender",
    "imageFilename": "66017605.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 27,
    "name": "SAMSUNG Galaxy Z",
    "brand": "Samsung",
    "category": "Phones",
    "price": 899,
    "description": "SAMSUNG Galaxy Z Flip 3 5G Cell Phone, Factory Unlocked Android Smartphone, 256GB, Flex Mode, Super Steady Camera, Ultra Compact, US Version, Phantom Black",
    "imageFilename": "10967363.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 28,
    "name": "Moto G Power",
    "brand": "Motorola",
    "category": "Phones",
    "price": "699",
    "description": "Moto G Power | 2022 | 3-Day Battery | Unlocked | Made for US by Motorola | 4/128GB | 50 MP Camera | Ice Blue.\r\nDYNAMIC ISLAND COMES TO Moto G Power — Dynamic Island bubbles up alerts and Live Activities — so you don’t miss them while you’re doing something else. You can see who’s calling, track your next ride, check your flight status, and so much more\r\nINNOVATIVE DESIGN — Moto G Power features a durable color-infused glass and aluminum design. It’s splash, water, and dust resistant.¹ The Ceramic Shield front is tougher than any smartphone glass. And the 6.1\" Super Retina XDR display² is up to 2x brighter in the sun compared to Moto G.\r\n48MP MAIN CAMERA WITH 2X TELEPHOTO — The 48MP Main camera shoots in super high-resolution. So it’s easier than ever to take standout photos with amazing detail. The 2x optical-quality Telephoto lets you frame the perfect close-up.\r\nNEXT-GENERATION PORTRAITS — Capture portraits with dramatically more detail and color. Just tap to shift the focus between subjects — even after you take the shot.\r\nPOWERHOUSE A16 BIONIC CHIP — The superfast chip powers advanced features like computational photography, fluid Dynamic Island transitions, and Voice Isolation for phone calls. And A16 Bionic is incredibly efficient to help deliver great all-day battery life.\r\nUSB-C CONNECTIVITY — The USB-C connector lets you charge your Mac or iPad with the same cable you use to charge Moto G Power. You can even use Moto G Power to charge Apple Watch or AirPods.\r\nVITAL SAFETY FEATURES — If your car breaks down when you’re off the grid, you can get help with Roadside Assistance via satellite. And if you need emergency services and you don’t have cell service or Wi-Fi, you can use Emergency SOS via satellite.\r\nWith Crash Detection, Moto G Power can detect a severe car crash and call for help if you can’t.\r\nDESIGNED TO MAKE A DIFFERENCE — Moto G Power comes with privacy protections that help keep you in control of your data. It’s made from more recycled materials to minimize environmental impact. And it has built-in features that make Moto G Power more accessible to all.",
    "imageFilename": "69725864.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 29,
    "name": "Nokia G10",
    "brand": "Nokia",
    "category": "Phones",
    "price": "689",
    "description": "Nokia G10 | Android 11 | Unlocked Smartphone | 3-Day Battery | Dual SIM | US Version | 3/32GB | 6.52-Inch Screen | 13MP Triple Camera | Dusk.\r\nDYNAMIC ISLAND COMES TO Nokia G10 — Dynamic Island bubbles up alerts and Live Activities — so you don’t miss them while you’re doing something else. You can see who’s calling, track your next ride, check your flight status, and so much more\r\nINNOVATIVE DESIGN — Nokia G10 features a durable color-infused glass and aluminum design. It’s splash, water, and dust resistant.¹ The Ceramic Shield front is tougher than any smartphone glass. And the 6.1\" Super Retina XDR display² is up to 2x brighter in the sun compared to Nokia G10.\r\n48MP MAIN CAMERA WITH 2X TELEPHOTO — The 48MP Main camera shoots in super high-resolution. So it’s easier than ever to take standout photos with amazing detail. The 2x optical-quality Telephoto lets you frame the perfect close-up.\r\nNEXT-GENERATION PORTRAITS — Capture portraits with dramatically more detail and color. Just tap to shift the focus between subjects — even after you take the shot.\r\nPOWERHOUSE A16 BIONIC CHIP — The superfast chip powers advanced features like computational photography, fluid Dynamic Island transitions, and Voice Isolation for phone calls. And A16 Bionic is incredibly efficient to help deliver great all-day battery life.\r\nUSB-C CONNECTIVITY — The USB-C connector lets you charge your Mac or iPad with the same cable you use to charge Nokia G10. You can even use Nokia G10 to charge Apple Watch or AirPods.\r\nVITAL SAFETY FEATURES — If your car breaks down when you’re off the grid, you can get help with Roadside Assistance via satellite. And if you need emergency services and you don’t have cell service or Wi-Fi, you can use Emergency SOS via satellite.\r\nWith Crash Detection, Nokia G10 can detect a severe car crash and call for help if you can’t.\r\nDESIGNED TO MAKE A DIFFERENCE — Nokia G10 comes with privacy protections that help keep you in control of your data. It’s made from more recycled materials to minimize environmental impact. And it has built-in features that make Nokia G10 more accessible to all.",
    "imageFilename": "46411326.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "id": 30,
    "name": "OnePlus Nord N20",
    "brand": "OnePlus",
    "category": "Phones",
    "price": "899",
    "description": "OnePlus Nord N20 5G | Android Smart Phone | 6.43\" AMOLED Display| 6+128GB | Unlocked | 4500 mAh Battery | 33W Fast Charging | Blue Smoke.\r\nDYNAMIC ISLAND COMES TO OnePlus — Dynamic Island bubbles up alerts and Live Activities — so you don’t miss them while you’re doing something else. You can see who’s calling, track your next ride, check your flight status, and so much more\r\nINNOVATIVE DESIGN — OnePlus features a durable color-infused glass and aluminum design. It’s splash, water, and dust resistant.¹ The Ceramic Shield front is tougher than any smartphone glass. And the 6.1\" Super Retina XDR display² is up to 2x brighter in the sun compared to OnePlus 14.\r\n48MP MAIN CAMERA WITH 2X TELEPHOTO — The 48MP Main camera shoots in super high-resolution. So it’s easier than ever to take standout photos with amazing detail. The 2x optical-quality Telephoto lets you frame the perfect close-up.\r\nNEXT-GENERATION PORTRAITS — Capture portraits with dramatically more detail and color. Just tap to shift the focus between subjects — even after you take the shot.\r\nPOWERHOUSE A16 BIONIC CHIP — The superfast chip powers advanced features like computational photography, fluid Dynamic Island transitions, and Voice Isolation for phone calls. And A16 Bionic is incredibly efficient to help deliver great all-day battery life.\r\nUSB-C CONNECTIVITY — The USB-C connector lets you charge your Mac or iPad with the same cable you use to charge OnePlus 15. You can even use OnePlus 15 to charge Apple Watch or AirPods.\r\nVITAL SAFETY FEATURES — If your car breaks down when you’re off the grid, you can get help with Roadside Assistance via satellite. And if you need emergency services and you don’t have cell service or Wi-Fi, you can use Emergency SOS via satellite.\r\nWith Crash Detection, OnePlus can detect a severe car crash and call for help if you can’t.\r\nDESIGNED TO MAKE A DIFFERENCE — OnePlus comes with privacy protections that help keep you in control of your data. It’s made from more recycled materials to minimize environmental impact. And it has built-in features that make OnePlus more accessible to all.\r\n",
    "imageFilename": "17327675.jpg",
    "createdAt": "2023-07-13T17:46:54.8900000"
  },
  {
    "name": "MacBook Pro",
    "brand": "Apple",
    "category": "Computers",
    "price": "1099",
    "description": "The most advanced Mac laptops for demanding workflows.\r\nThree giant leaps: MacBook Pro blasts forward with the M3, M3 Pro, and M3 Max chips. Built on 3-nanometer technology and featuring an all-new GPU architecture, they’re the most advanced chips ever built for a personal computer. And each one brings more pro performance and capability.\r\nGame-changing graphics performance:\r\n- Behold an entirely new class of GPU architecture. And the biggest breakthrough in graphics yet for Apple silicon. Dynamic Caching optimizes fast on-chip memory to dramatically increase average GPU utilization — driving a huge performance boost for the most demanding pro apps and games.\r\n- Games will look more detailed than ever thanks to hardware-accelerated mesh shading. This brings greater capability and efficiency to geometry processing, enabling games to render more visually complex scenes.\r\nHardware-accelerated ray tracing: For the first time, MacBook Pro features hardware-accelerated ray tracing. Combined with the new graphics architecture, it enables pro apps to deliver up to two and a half times faster rendering performance and allows games to provide more realistic shadows and reflections.\r\nWe can do this all day: MacBook Pro has the longest battery life ever in a Mac — up to 22 hours. That efficiency is the magic of Apple silicon. And all models remain just as fast whether plugged in or not. So wherever inspiration strikes or whenever duty calls, run with it.\r\nThe best display ever in a laptop: Extreme Dynamic Range (XDR) brings refined specular highlights, incredible detail in shadows, and vibrant, true-to-life colors. Calibrated in the factory, each Liquid Retina XDR display also features ProMotion and pro reference modes.\r\nAmps up apps: With thousands of apps optimized to unlock the full power of macOS and Apple silicon, M3 chips accelerate performance like never before. Now apps just soar — from your go-to productivity apps to your favorite games and hardest-working pro apps.",
    "imageFilename": "1703859448449_macbook pro.jpeg",
    "createdAt": "2023-12-29T14:16:27.551Z",
    "id": 31
  }
]

products.forEach(product => {
  const newProduct = new Product()
  newProduct.id = product.id
  newProduct.name = product.name
  newProduct.brand = product.brand
  newProduct.category = product.category
  newProduct.price = product.price
  newProduct.description = product.description
  newProduct.imageFilename = product.imageFilename
  newProduct.createdAt = product.createdAt
  newProduct.save()
    .then(() => console.log("Product saved"))
    .catch((err) => console.log(err));
})
*/
