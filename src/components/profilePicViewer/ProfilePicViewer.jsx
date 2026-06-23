import "./profilePicViewer.css";

/**
 * WhatsApp-style profile picture viewer.
 * Props:
 *   src      – image URL
 *   name     – display name shown below the picture
 *   onClose  – callback to close the overlay
 */
const ProfilePicViewer = ({ src, name, onClose }) => {
  if (!src && !name) return null;

  return (
    <div className="ppvOverlay" onClick={onClose}>
      {/* stop clicks on the card itself from closing */}
      <div className="ppvCard" onClick={(e) => e.stopPropagation()}>
        {/* close button top-right */}
        <button className="ppvClose" onClick={onClose} aria-label="Close">
          &#x2715;
        </button>

        {/* name bar */}
        <div className="ppvNameBar">{name || "User"}</div>

        {/* picture */}
        <div className="ppvImgWrap">
          <img
            src={src || "./avatar.png"}
            alt={name || "Profile"}
            draggable={false}
          />
        </div>

        {/* subtle bottom action row */}
        <div className="ppvActions">
          <a
            href={src || "./avatar.png"}
            target="_blank"
            rel="noreferrer"
            className="ppvSaveBtn"
            onClick={(e) => e.stopPropagation()}
          >
            View full size ↗
          </a>
        </div>
      </div>
    </div>
  );
};

export default ProfilePicViewer;
