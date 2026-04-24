import { Panel } from "../components/ui/Panel";

const cards = [
  {
    title: "Ahorro potencial",
    value: "14%",
    description: "Estimación preliminar frente al esquema de compra actual.",
    width: "w-2/3",
  },
  {
    title: "Riesgo contractual",
    value: "Bajo",
    description: "Posición relativa considerando exposición, vencimientos y cobertura.",
    width: "w-1/3",
  },
  {
    title: "Comercializadores",
    value: "12",
    description: "Actores de referencia para evaluar alternativas operativas.",
    width: "w-3/4",
  },
];

export default function Migration() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm uppercase text-mist">Migración al MEM</p>
        <h2 className="mt-1 font-fraunces text-3xl font-bold text-ivory">
          Evaluación de migración y comercializadores
        </h2>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        {cards.map((item) => (
          <Panel className="min-h-52 p-5" key={item.title}>
            <p className="text-sm text-mist">{item.title}</p>
            <p className="number mt-6 font-syne text-4xl font-bold text-ivory">{item.value}</p>
            <p className="mt-3 text-sm leading-6 text-mist">{item.description}</p>
            <div className="mt-8 h-2 rounded bg-navy-border">
              <div className={`h-2 rounded bg-forest ${item.width}`} />
            </div>
          </Panel>
        ))}
      </div>

      <Panel className="p-5">
        <h3 className="font-syne text-base font-bold text-ivory">Lectura ejecutiva</h3>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-mist">
          Esta vista resume una evaluación preliminar de migración para abrir la
          conversación comercial y regulatoria. Podemos profundizar luego con
          escenarios por comercializador, sensibilidad de precio y riesgo de
          abastecimiento cuando el modelo de datos quede definido.
        </p>
      </Panel>
    </div>
  );
}
