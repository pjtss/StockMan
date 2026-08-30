import { PageNavigation } from "@/components/page-navigation"; import { InquiryForm } from "@/components/inquiry-form";
export default function NewInquiryPage(){return <><PageNavigation current="inquiries"/><main className="page-shell"><section className="hero"><div className="kicker">COMMUNITY</div><h1>문의 작성</h1></section><InquiryForm/></main></>}
