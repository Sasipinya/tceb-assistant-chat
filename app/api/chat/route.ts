import { NextRequest, NextResponse } from 'next/server';

// ใช้ Edge Runtime เพื่อประหยัดค่าใช้จ่าย
export const runtime = 'edge';

// Simple in-memory rate limiting (สำหรับ Edge)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function rateLimit(identifier: string, limit = 10, windowMs = 60000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(identifier);

  // Clean up old entries
  if (record && now > record.resetTime) {
    rateLimitMap.delete(identifier);
  }

  const current = rateLimitMap.get(identifier);
  
  if (!current) {
    rateLimitMap.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count++;
  return true;
}

export async function POST(request: NextRequest) {
  try {
    // 1. Rate Limiting - ใช้ IP address
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';
    
    if (!rateLimit(ip, 20, 60000)) { // 20 requests ต่อนาที
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    // 2. Validate input
    const body = await request.json();
    const { query, conversation_id } = body;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return NextResponse.json(
        { error: 'Query is required and must be a non-empty string' },
        { status: 400 }
      );
    }

    if (query.length > 2000) {
      return NextResponse.json(
        { error: 'Query is too long (max 2000 characters)' },
        { status: 400 }
      );
    }

    // 3. Environment variables
    const apiUrl = process.env.API_URL;
    const bearerToken = process.env.API_BEARER_TOKEN;
    const userEmail = process.env.API_USER_EMAIL;

    if (!apiUrl || !bearerToken || !userEmail) {
      console.error('Missing required environment variables');
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // 4. Call API with streaming mode
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
        },
        body: JSON.stringify({
          query: query.trim(),
          inputs: {},
          response_mode: 'streaming', // ✅ เปลี่ยนเป็น streaming
          conversation_id: conversation_id || '',
          user: userEmail,
          files: [],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, errorText);
        
        // Return user-friendly error messages
        if (response.status === 401) {
          return NextResponse.json(
            { error: 'Authentication failed' },
            { status: 500 }
          );
        }
        
        if (response.status === 429) {
          return NextResponse.json(
            { error: 'Too many requests to AI service. Please try again later.' },
            { status: 429 }
          );
        }

        return NextResponse.json(
          { error: `API error: ${response.status}` },
          { status: response.status }
        );
      }

      // ✅ Stream response กลับไปให้ client
      return new Response(response.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable buffering for nginx/reverse proxies
        },
      });

    } catch (fetchError) {
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return NextResponse.json(
          { error: 'Request timeout. Please try again.' },
          { status: 504 }
        );
      }
      throw fetchError;
    }

  } catch (error) {
    console.error('Request Error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to process request',
        details: process.env.NODE_ENV === 'development' 
          ? (error instanceof Error ? error.message : 'Unknown error')
          : undefined
      },
      { status: 500 }
    );
  }
}

// Optional: GET method for health check
export async function GET() {
  return NextResponse.json({ 
    status: 'ok',
    timestamp: new Date().toISOString()
  });
}