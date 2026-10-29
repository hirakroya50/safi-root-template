import React from 'react'
import { useBranding } from './BrandingProvider'

export const Workspace: React.FC = () => {
  const config = useBranding()

  return (
    <section className="safi-workspace" id="offerings" aria-labelledby="offerings-title">
      <h2 id="offerings-title">{config.sections.offerings}</h2>
      <div className="safi-workspace-placeholder">
        {config.offerings.length === 0 ? (
          <p className="safi-empty">
            Offerings from the configuration will show here.
          </p>
        ) : (
          <ul className="safi-offering-list">
            {config.offerings.map((offering) => (
              <li className="safi-offering" key={`${offering.title}-${offering.meta ?? ''}`}>
                {offering.meta ? <p className="safi-meta">{offering.meta}</p> : null}
                <h3>{offering.title}</h3>
                <p className="safi-offering-detail">{offering.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
