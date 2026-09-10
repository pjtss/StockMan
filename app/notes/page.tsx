import { PageNavigation } from "@/components/page-navigation";
import { NotesWorkbench } from "@/components/notes-workbench";
export default function NotesPage(){return <><PageNavigation current="notes"/><main className="page-shell"><section className="hero"><div className="kicker">PERSONAL NOTES</div><h1>Markdown 메모장</h1><p>관심 있는 내용을 나만의 텍스트 메모로 정리하세요.</p></section><NotesWorkbench/></main></>}
