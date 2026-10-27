# Flipkart Clone – Backend API

A RESTful backend API for a full-stack e-commerce application inspired by Flipkart, built using **Node.js, Express.js, and MongoDB**. It provides secure user authentication, product management, shopping cart operations, order processing, Razorpay payment integration, image management, and role-based admin functionality.

## 🚀 Live API

- **Backend URL:** https://flipkart-clone-backend-esb4.onrender.com
- **Frontend Website:** https://flipkart-clone-6bsn.vercel.app

## ✨ Features

### 🔐 Authentication and Authorization
- User registration and login.
- JWT-based access token authentication.
- Refresh token handling with HTTP-only cookies.
- Protected routes and authentication middleware.
- Role-based authorization for admin functionality.

### 📦 Product Management
- Retrieve product listings and product details.
- Search, filter, and sort products.
- Admin product creation, updating, and deletion.
- Activate and deactivate products.
- MongoDB-based product storage and retrieval.
- Cloudinary integration for product images.

### 🛒 Cart and Order Management
- Add products to the shopping cart.
- Update product quantities and remove cart items.
- Persistent cart management for authenticated users.
- Order creation and retrieval.
- Order details and payment status management.

### 💳 Payment Integration
- Razorpay order creation.
- Payment signature verification.
- Backend payment verification.
- Integration with the frontend checkout workflow.

### 👤 User and Admin Management
- User profile management.
- Profile image upload using Cloudinary.
- Admin dashboard API endpoints.
- Product and user administration.
- Protected administrative operations.

## 🧰 Tech Stack

| Technology | Purpose |
|---|---|
| Node.js | JavaScript runtime |
| Express.js | REST API framework |
| MongoDB | NoSQL database |
| Mongoose | Database modeling and queries |
| JWT | Authentication and authorization |
| bcrypt / bcryptjs | Password hashing, if configured |
| Razorpay | Payment gateway |
| Cloudinary | Image storage and delivery |
| dotenv | Environment configuration |
| Axios | Frontend API communication |
| Git & GitHub | Version control |

## 📂 Project Structure

```text
Backend/
├── src/
│   ├── controllers/
│   │   ├── payment.controller.js
│   │   └── ...
│   ├── middleware/
│   │   ├── authMiddleware.js
│   │   ├── adminMiddleware.js
│   │   └── ...
│   ├── models/
│   │   ├── user.model.js
│   │   └── ...
│   ├── routes/
│   │   ├── payment.routes.js
│   │   └── ...
│   ├── app.js
│   └── server.js
├── .env
├── package.json
└── README.md
```

*The structure above is illustrative. Update filenames to match your actual backend repository.*

## ⚙️ Installation and Setup

### Prerequisites

- Node.js and npm
- MongoDB or a MongoDB Atlas account
- Razorpay account for payment testing
- Cloudinary account for image uploads

### 1. Clone the Repository

```bash
git clone <YOUR_BACKEND_REPOSITORY_URL>
cd Backend
```

Replace the placeholder with your actual backend GitHub repository URL.

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the backend root directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string

JWT_ACCESS_SECRET=your_access_token_secret
JWT_REFRESH_SECRET=your_refresh_token_secret

RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

FRONTEND_URL=http://localhost:5173
```

**Important:** Use the exact environment variable names expected by your code. Add any other variables your project requires. Never commit real credentials to GitHub.

### 4. Start the Server

Use the script configured in your `package.json`. For example, if your project supports the `dev` script:

```bash
npm run dev
```

Otherwise, use the appropriate start command defined in your project.

The backend will run at `http://localhost:5000` if configured with port `5000`.

## 🔌 API Overview

The following endpoint groups describe the application's intended API functionality. Exact routes and HTTP methods depend on your implementation.

| Module | Functionality |
|---|---|
| Authentication | Register, login, refresh token, logout |
| Products | Retrieve product lists and individual products |
| Admin Products | Create, update, activate, deactivate, and delete products |
| Cart | Retrieve and modify cart items |
| Orders | Create orders and retrieve order details |
| Payments | Create Razorpay orders and verify payments |
| Users | Manage profile information and profile images |
| Admin Users | Retrieve and manage users |

The payment routes currently include:

- `POST /api/payment/create-order`
- `POST /api/payment/verify`

These endpoints are mounted under `/api/payment` in the Express application.

## 💳 Razorpay Payment Flow

1. The frontend requests a new payment order from the backend.
2. The backend creates an order using Razorpay.
3. The customer completes the payment through Razorpay Checkout.
4. The frontend sends the payment details to the backend.
5. The backend verifies the Razorpay payment signature.
6. The frontend displays confirmation after successful verification.

Use Razorpay Test Mode for development and verify payment results on the server before treating an order as paid.

## 🔒 Security Practices

- Store credentials in environment variables.
- Hash passwords before saving them.
- Protect private routes with authentication middleware.
- Enforce admin authorization on administrative endpoints.
- Validate incoming request data.
- Verify Razorpay payment signatures on the backend.
- Configure CORS to allow trusted frontend origins.
- Use secure, HTTP-only cookies for refresh tokens where appropriate.
- Never expose private API keys or secrets in public repositories.

## 🌐 Deployment

The backend can be deployed to platforms such as Render, with MongoDB Atlas for database hosting and Cloudinary for image management.

Before deployment:

1. Configure all required production environment variables.
2. Set the production frontend URL in CORS configuration.
3. Verify MongoDB Atlas network access and database permissions.
4. Configure secure cookie options for production.
5. Test authentication, product APIs, cart, checkout, and payment verification.

## 🔮 Future Improvements

- Razorpay webhook integration for independent payment event processing.
- Advanced MongoDB aggregation and product filtering.
- Rate limiting and additional API security.
- Real-time customer and seller chat using Socket.IO.
- Expanded order management and analytics.
- Automated API testing and improved error handling.

## 👨‍💻 Author

**Virang Dalwadi**

MCA Student | MERN Stack Developer

Interested in building secure, scalable, and maintainable web applications.

## 📄 Disclaimer

This project was developed for educational and portfolio purposes. Flipkart is a trademark of its respective owner. This project is not affiliated with or endorsed by Flipkart.
