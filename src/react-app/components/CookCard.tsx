import type { Pack, Project } from "../../shared/types";
import { missingMustUse, normalizeProject, stepOn } from "../../shared/types";

type Props = {
	pack: Pack;
	project: Project;
	onPreviewSample?: (sampleId: string) => void;
};

export function CookCard({ pack, project, onPreviewSample }: Props) {
	const p = normalizeProject(project);
	const missing = missingMustUse(pack, p);
	const mustSamples = pack.brief.mustUseIds
		.map((id) => pack.samples.find((s) => s.id === id))
		.filter(Boolean);

	return (
		<section className="cook-card">
			<header>
				<p className="eyebrow">cook card · {pack.genre}</p>
				<h3>{pack.brief.title}</h3>
				<p className="vibe">{pack.brief.vibe}</p>
			</header>

			<div className="must-grid">
				{mustSamples.map((s) => {
					if (!s) return null;
					const chIdx = p.channels.findIndex((c) => c.sampleId === s.id);
					let hits = 0;
					if (chIdx >= 0) {
						for (const pat of p.patterns) {
							hits +=
								pat.tracks[chIdx]?.steps.filter((cell) => stepOn(cell)).length ??
								0;
						}
					}
					const ok = hits > 0;
					return (
						<button
							key={s.id}
							type="button"
							className={`must-chip ${ok ? "ok" : "need"}`}
							onClick={() => onPreviewSample?.(s.id)}
							title={s.useHint}
						>
							<span className="must-role">{s.role}</span>
							<span className="must-name">{s.name}</span>
							<span className="must-state">{ok ? `${hits} hits` : "USE ME"}</span>
						</button>
					);
				})}
			</div>

			<ul className="cook-rules">
				{pack.brief.rules.map((r) => (
					<li key={r}>{r}</li>
				))}
			</ul>
			<p className="cook-tip">
				<strong>Tip:</strong> {pack.brief.tip}
			</p>
			{missing.length > 0 ? (
				<p className="cook-warn">Still need: {missing.join(", ")}</p>
			) : (
				<p className="cook-ready">All required elements are in the pattern.</p>
			)}
		</section>
	);
}
