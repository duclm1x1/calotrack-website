import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/auth/reset-password
 * Update password with token from email
 */
export async function POST(request: NextRequest) {
  try {
    const { password, confirmPassword } = await request.json();

    if (!password || !confirmPassword) {
      return NextResponse.json(
        { error: "Password and confirmation are required" },
        { status: 400 }
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Passwords do not match" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    
    const { error } = await supabase.auth.updateUser({
      password: password,
    });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ 
      message: "Password updated successfully" 
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    );
  }
}
