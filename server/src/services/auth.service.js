
import bcrypt from "bcryptjs";
import mongoose from "mongoose";

import User from "../models/User.js";
import Workspace from "../models/Workspace.js";
import generateToken from "../utils/token.js";

const createSlug = (name) => {
  const baseSlug = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${baseSlug}-${Date.now().toString(36)}`;
};

export const registerUser = async ({
  name,
  email,
  password,
  workspaceName,
}) => {
  const normalizedEmail = email.toLowerCase().trim();

  const existingUser = await User.findOne({
    email: normalizedEmail,
  });

  if (existingUser) {
    const error = new Error("An account with this email already exists");
    error.status = 409;
    throw error;
  }

  const session = await mongoose.startSession();

  try {
    let createdUser;

    await session.withTransaction(async () => {
      const passwordHash = await bcrypt.hash(password, 12);

      const workspace = new Workspace({
        name: workspaceName,
        slug: createSlug(workspaceName),
        owner: new mongoose.Types.ObjectId(),
      });

      const user = new User({
        name,
        email: normalizedEmail,
        passwordHash,
        role: "co_founder",
        workspaceId: workspace._id,
      });

      workspace.owner = user._id;

      await workspace.save({ session });
      await user.save({ session });

      createdUser = user;
    });

    return {
      user: {
        id: createdUser._id,
        name: createdUser.name,
        email: createdUser.email,
        role: createdUser.role,
        workspaceId: createdUser.workspaceId,
      },
      token: generateToken(createdUser),
    };
  } catch (error) {
    if (error.code === 11000) {
      const conflictError = new Error(
        "An account with this email already exists"
      );
      conflictError.status = 409;
      throw conflictError;
    }

    throw error;
  } finally {
    await session.endSession();
  }
};

export const loginUser = async ({ email, password }) => {
  const user = await User.findOne({
    email: email.toLowerCase().trim(),
  }).select("+passwordHash");

  if (!user || !user.isActive) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const passwordMatches = await bcrypt.compare(
    password,
    user.passwordHash
  );

  if (!passwordMatches) {
    const error = new Error("Invalid email or password");
    error.status = 401;
    throw error;
  }

  const workspace = await Workspace.findById(user.workspaceId);

  if (!workspace || workspace.status !== "active") {
    const error = new Error("Workspace is unavailable");
    error.status = 403;
    throw error;
  }

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      workspaceId: user.workspaceId,
    },
    token: generateToken(user),
  };
};
