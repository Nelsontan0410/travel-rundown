// 照片来源与授权：旅程介绍页用到的每张照片的标题、作者、原图页面、许可证和修改说明（CC 署名要求）。
import { Link, useNavigate } from 'react-router-dom';
import p from './Story.module.css';
import { Icon } from '../components/Icon';
import { LANDING_MEDIA } from '../domain/landingMedia';

export default function CreditsPage() {
  const nav = useNavigate();
  const rows = LANDING_MEDIA.filter((m) => m.credit);
  return (
    <div className={p.page}>
      <button type="button" className={p.back} onClick={() => (window.history.length > 1 ? nav(-1) : nav('/'))}>
        <Icon name="ChevronLeft" size="sm" />
        返回
      </button>
      <section className={p.section} aria-labelledby="h-credits" style={{ marginTop: 96 }}>
        <div className={p.secHead}>
          <h1 id="h-credits" className={p.h2}>照片来源与授权</h1>
          <p className={p.secLead}>
            旅程介绍页的照片都来自 Wikimedia Commons，按各自的知识共享许可使用。我们只做了裁切、缩放和压缩，没有生成、修图或加滤镜。
            CC BY-SA 照片的裁切版沿用同一许可证。
          </p>
        </div>
        <ul className={p.creditList}>
          {rows.map((m) => {
            const c = m.credit!;
            return (
              <li key={m.id} className={p.creditRow}>
                <img src={m.file} alt={m.alt} loading="lazy" decoding="async" className={p.creditThumb} />
                <div className={p.creditText}>
                  <p className={p.creditTitle}>{c.title}</p>
                  <p className={p.small}>
                    作者 {c.author}，许可{' '}
                    <a href={c.license_url} target="_blank" rel="noreferrer">
                      {c.license}
                    </a>
                    ，
                    <a href={c.source} target="_blank" rel="noreferrer">
                      查看原图
                    </a>
                  </p>
                  {c.notes && <p className={p.small}>{c.notes}</p>}
                  <p className={p.small}>修改：{c.modifications}</p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className={p.small}>
          <Link to="/itinerary">回到行程</Link>
        </p>
      </section>
    </div>
  );
}
