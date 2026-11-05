
import {
  registerUser,
  loginUser,
} from "../services/auth.service.js";

export const register = async (req, res) => {
  const result = await registerUser(req.validatedBody);

  res.status(201).json({
    success: true,
    message: "Workspace and account created successfully",
    data: result,
  });
};

export const login = async (req, res) => {
  const result = await loginUser(req.validatedBody);

  res.status(200).json({
    success: true,
    message: "Login successful",
    data: result,
  });
};

export const getMe = async (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      user: req.user,
    },
  });
};

