import { useEffect, useState } from 'react';
import type { Dataset } from './types';
import { PipelineDataSource, type DataSource } from './data/source';
import { StoreProvider, useStore } from './state/store';
import { Cover, FilterBar, Footer, MethodModal, Nav, PostDrawer } from './components/Layout';
import { Overview } from './tabs/Overview';
import { Evolution } from './tabs/Evolution';
import { Contents } from './tabs/Contents';
import { Audience, AudienceUnavailable } from './tabs/Audience';
import './styles/global.css';

// JSONs publicados pelo pipeline em docs/dados/ (relativo a docs/index.html).
const source: DataSource = new PipelineDataSource('./dados');

function Shell() {
  const { state, ds } = useStore();
  return (
    <>
      <Cover />
      <Nav />
      <main>
        <div className="wrap">
          <FilterBar />
          <div role="tabpanel">
            {state.tab === 'visao' && <Overview />}
            {state.tab === 'evolucao' && <Evolution />}
            {state.tab === 'conteudos' && <Contents />}
            {state.tab === 'publico' && (ds.meta.hasAudience ? <Audience /> : <AudienceUnavailable />)}
          </div>
        </div>
      </main>
      <Footer />
      <PostDrawer />
      <MethodModal />
    </>
  );
}

export default function App() {
  const [data, setData] = useState<Dataset | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prog, setProg] = useState<[number, number]>([0, 0]);
  useEffect(() => {
    source.load((d, t) => setProg([d, t])).then(setData).catch((e: Error) => setErr(e.message));
  }, []);
  if (err) {
    const fileProtocol = location.protocol === 'file:';
    return (
      <div className="wrap" style={{ padding: 40 }}>
        <div className="notice warn">
          Não foi possível carregar os dados de <code>docs/dados/</code>: {err}.
          {fileProtocol && <> O navegador bloqueia a leitura de arquivos ao abrir o HTML direto do disco. Rode <code>python -m http.server -d docs</code> e acesse <code>http://localhost:8000</code>.</>}
        </div>
      </div>
    );
  }
  if (!data) {
    const pct = prog[1] ? Math.round((prog[0] / prog[1]) * 100) : 0;
    return <div className="wrap" style={{ padding: 40 }} role="status" aria-live="polite">Carregando dados do pipeline… {prog[1] ? `${pct}% (${prog[0]} de ${prog[1]} arquivos)` : ''}</div>;
  }
  return <StoreProvider base={data}><Shell /></StoreProvider>;
}
