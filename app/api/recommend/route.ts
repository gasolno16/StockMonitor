import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(req: NextRequest) {
  try {
    const { stocks, apiKey } = await req.json();
    const key = apiKey || process.env.GEMINI_API_KEY || "";
    if (!key) {
      return NextResponse.json({ error: "API 키가 없습니다. 설정에서 Gemini API 키를 입력해주세요." }, { status: 400 });
    }
    const genAI = new GoogleGenerativeAI(key);

    if (!stocks || stocks.length === 0) {
      return NextResponse.json({ error: "종목 데이터가 없습니다" }, { status: 400 });
    }

    const stockList = stocks
      .map((s: { name: string; symbol: string; market: string; price: number; changePercent: number }) =>
        `- ${s.name} (${s.symbol}, ${s.market}): 현재가 ${s.price.toLocaleString()}, 등락률 ${s.changePercent.toFixed(2)}%`
      )
      .join("\n");

    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const prompt = `당신은 주식 분석 어시스턴트입니다. 아래 관심 종목 현황을 보고 간단한 분석과 관심 가져볼 만한 종목을 추천해주세요.

현재 관심 종목:
${stockList}

반드시 아래 JSON 형식으로만 답하세요 (다른 텍스트 없이):
{
  "summary": "전체 포트폴리오 한줄 요약",
  "analysis": "현재 종목들 간단 분석 (2-3문장)",
  "recommendations": [
    { "symbol": "티커", "name": "종목명", "market": "KR 또는 US", "reason": "추천 이유 한 문장" }
  ]
}
recommendations는 3개만 제공하세요. 투자 조언이 아닌 참고용입니다.`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    // JSON 블록 추출
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("JSON 파싱 실패");

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch (e) {
    console.error("Gemini error:", e);
    return NextResponse.json({ error: "AI 추천을 가져오지 못했습니다" }, { status: 500 });
  }
}
